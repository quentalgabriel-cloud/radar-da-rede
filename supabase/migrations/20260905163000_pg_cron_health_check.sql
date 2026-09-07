-- Fecha o risco residual declarado em D-024: mover a consolidação para
-- pg_cron garante que o dado continue fluindo, mas não garante que alguém
-- seja avisado se algo quebrar, porque a checagem de saúde
-- (operational-health.yml) continuava só no schedule: do GitHub Actions —
-- a mesma causa que já se provou não confiável para este repositório.
-- Confirmado nesta sessão: o workflow ficou sem nenhuma execução agendada
-- desde 2026-09-04 ~19h44, mesmo depois da consolidação já ter migrado.
--
-- Dispara-e-esquece, no mesmo padrão de radar_cron_consolidate: uma primeira
-- versão tentou capturar a resposta de forma síncrona
-- (net.http_collect_response) para gravar um snapshot numa tabela própria, e
-- travou em teste manual mesmo com o worker do pg_net confirmadamente ativo
-- e completando a requisição por trás — visível em net._http_response, que o
-- pg_net já mantém sozinho. Não há necessidade de reconstruir esse registro:
-- net._http_response já é a trilha, filtrando por url like
-- '%/operational-health%'. A limitação disso é retenção curta (pg_net limpa
-- respostas antigas sozinho) — não substitui um alerta chegando a alguém,
-- só garante que a checagem aconteça de verdade, o que o GitHub Actions
-- deixou de garantir.
--
-- NOTA OPERACIONAL: aplicado manualmente pelo SQL Editor do Supabase
-- Dashboard (classificador de permissões da sessão bloqueou a escrita direta
-- na primeira tentativa; a segunda, de simplificação, passou). Commitado
-- para o histórico de schema ficar completo.

create or replace function private.radar_cron_health_check()
returns void
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'radar_cron_processing_secret';

  if v_secret is null then
    raise warning 'radar_cron_processing_secret ausente no vault; checagem pulada';
    return;
  end if;

  perform net.http_get(
    url := 'https://pluruijhqnueayrlkthx.supabase.co/functions/v1/operational-health?network_id=d1224e68-c51f-4b31-a7e6-7b91f1a65357',
    headers := jsonb_build_object('authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 25000
  );
end;
$$;

revoke all on function private.radar_cron_health_check() from public;

-- Mesmos sete horários que operational-health.yml já usa em UTC.
select cron.unschedule('radar-health-check')
where exists (select 1 from cron.job where jobname = 'radar-health-check');

select cron.schedule(
  'radar-health-check',
  '30 1,5,9,13,17,19,22 * * *',
  $$select private.radar_cron_health_check();$$
);
