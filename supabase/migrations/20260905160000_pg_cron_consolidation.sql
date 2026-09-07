-- Agendamento da consolidação por pg_cron, não mais pelo `schedule:` do
-- GitHub Actions. Decisão completa em D-024, docs/DECISIONS.md.
--
-- Medido em 2026-09-05: o schedule: do GitHub Actions ficou ~19h sem disparar
-- neste repositório, em dois workflows independentes, com workflow_dispatch
-- funcionando normalmente no mesmo período — falha de entrega da plataforma
-- para este repositório, não de código. pg_cron e pg_net elimina essa
-- dependência ao mover o disparo para dentro do próprio banco.
--
-- NOTA OPERACIONAL: este arquivo foi aplicado manualmente pelo SQL Editor do
-- Supabase Dashboard, não pela ferramenta de migration, porque a ação de
-- escrita em produção foi bloqueada pelo classificador de permissões da
-- sessão que a escreveu. O conteúdo é idêntico ao que rodou. Registrado aqui
-- para que o histórico de schema permaneça completo e a migration seja
-- reaplicável (idempotente: `if not exists` e `create or replace` em toda
-- parte) em qualquer ambiente que ainda não a tenha.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Credencial nova, exclusiva deste caminho, gerada inteiramente dentro da
-- transação: nasce, grava o hash em processing_credentials e o valor em
-- claro em vault.secrets, e não sai do banco em nenhum momento.
do $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash text := encode(extensions.digest(v_token, 'sha256'), 'hex');
begin
  if not exists (
    select 1 from vault.secrets where name = 'radar_cron_processing_secret'
  ) then
    insert into public.processing_credentials (network_id, token_hash, token_hint, label)
    values (
      'd1224e68-c51f-4b31-a7e6-7b91f1a65357',
      v_hash,
      left(v_token, 4) || '…' || right(v_token, 4),
      'pg_cron scheduled consolidation'
    );
    perform vault.create_secret(
      v_token,
      'radar_cron_processing_secret',
      'Credencial usada pelo pg_cron para chamar process-window.'
    );
  end if;
end $$;

-- Dispara-e-esquece: a prova de que funcionou é a linha em processing_runs
-- que a própria process-window grava. Se falhar, a vigilância já corrigida
-- (scheduler_stalled, PR #17) acusa pelo ends_at parado — este bloco não
-- precisa registrar sucesso/falha por conta própria.
create or replace function private.radar_cron_consolidate()
returns void
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_secret text;
  v_ends_at timestamptz := date_trunc('hour', now());
  v_starts_at timestamptz := v_ends_at - interval '24 hours';
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'radar_cron_processing_secret';

  if v_secret is null then
    raise warning 'radar_cron_processing_secret ausente no vault; consolidação pulada';
    return;
  end if;

  perform net.http_post(
    url := 'https://pluruijhqnueayrlkthx.supabase.co/functions/v1/process-window',
    headers := jsonb_build_object('authorization', 'Bearer ' || v_secret, 'content-type', 'application/json'),
    body := jsonb_build_object(
      'network_id', 'd1224e68-c51f-4b31-a7e6-7b91f1a65357',
      'starts_at', v_starts_at,
      'ends_at', v_ends_at
    ),
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function private.radar_cron_consolidate() from public;

-- Mesmos seis horários que .github/workflows/consolidate.yml usava em UTC
-- (00, 03, 06, 11, 16, 21 = 21h, 00h, 03h, 08h, 13h, 18h em America/Recife).
-- Preservar o mesmo relógio importa: a política de comparação
-- same_slot_previous_day@1 casa cada slot com ele mesmo no dia anterior.
select cron.unschedule('radar-consolidate')
where exists (select 1 from cron.job where jobname = 'radar-consolidate');

select cron.schedule(
  'radar-consolidate',
  '0 0,3,6,11,16,21 * * *',
  $$select private.radar_cron_consolidate();$$
);
