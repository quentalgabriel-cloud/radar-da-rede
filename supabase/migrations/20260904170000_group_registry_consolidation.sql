-- Consolidação do registry inflado pela identidade volátil de conversa.
--
-- O sensor deriva o id da conversa do título bruto, e o título do WhatsApp
-- carrega a contagem acumulada de mensagens. Cada notificação mudava o hash e
-- criava um grupo novo: 196 grupos para uma única conversa. A correção na
-- origem já entrou em process-window; esta função reconstrói o passado.
--
-- A regra de canonicalização NÃO vive aqui. Ela vive em
-- supabase/functions/_shared/canonical-conversations.js, é a mesma que resolve
-- grupo e a mesma que exibe. O chamador aplica a regra e passa o resultado em
-- p_label_map; este código só consulta esse mapa por igualdade exata de texto.
-- Duas implementações da mesma regra divergiriam, e divergir aqui significaria
-- fundir conversas distintas — o dano que a consolidação existe para evitar.

-- Trilha permanente do que foi fundido em quê. Existe para que a operação seja
-- reversível e auditável: sem ela, uma fusão errada seria indistinguível de um
-- grupo que nunca existiu.
create table public.group_merge_map (
  id uuid primary key default gen_random_uuid(),
  network_id uuid not null references public.networks(id) on delete cascade,
  merged_group_id uuid not null references public.groups(id) on delete cascade,
  survivor_group_id uuid not null references public.groups(id) on delete cascade,
  canonical_key text not null check (char_length(canonical_key) between 1 and 255),
  evidence jsonb not null default '{}'::jsonb,
  merged_at timestamptz not null default now(),
  unique (merged_group_id),
  check (merged_group_id <> survivor_group_id)
);

create index group_merge_map_survivor_idx
  on public.group_merge_map (network_id, survivor_group_id);

alter table public.group_merge_map enable row level security;
create policy group_merge_map_select_member on public.group_merge_map
  for select to authenticated using (private.is_network_member(network_id));
grant select on public.group_merge_map to authenticated;

-- Planeja e, se autorizado, aplica a consolidação. Sem p_apply a função só
-- devolve o plano: nada é escrito, e o relatório é o mesmo que a aplicação
-- usaria. Conferir o plano antes de aplicar é o único jeito de saber que o
-- mapa recebido corresponde ao estado real do banco.
create or replace function private.consolidate_group_registry(
  p_network_id uuid,
  p_label_map jsonb,
  p_apply boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_sem_mapa integer;
  v_antes integer;
  v_depois integer;
  v_plano jsonb;
  v_recusados jsonb;
begin
  if jsonb_typeof(p_label_map) <> 'array' then
    raise exception 'invalid_label_map';
  end if;

  -- Chamar o ensaio e a aplicação na mesma transação é o uso esperado; sem
  -- soltar as temporárias antes, a segunda chamada leria o plano da primeira.
  drop table if exists tmp_mapa;
  drop table if exists tmp_alias;
  drop table if exists tmp_chave;
  drop table if exists tmp_sobrevivente;
  drop table if exists tmp_fusao;

  create temporary table tmp_mapa on commit drop as
  select item->>'observed_label' as observed_label,
         item->>'canonical_label' as canonical_label,
         item->>'canonical_key' as canonical_key
  from jsonb_array_elements(p_label_map) item;

  if exists (
    select 1 from tmp_mapa
    where observed_label is null or canonical_label is null or canonical_key is null
  ) then
    raise exception 'invalid_label_map_entry';
  end if;

  -- Todo alias precisa constar do mapa. Um alias de fora significaria que o
  -- chamador canonicalizou um conjunto desatualizado; seguir assim deixaria
  -- grupos inflados para trás sem que ninguém notasse.
  select count(*) into v_sem_mapa
  from public.group_aliases a
  left join tmp_mapa m on m.observed_label = a.observed_label
  where a.network_id = p_network_id and m.observed_label is null;
  if v_sem_mapa > 0 then
    raise exception 'label_map_incomplete: % alias sem entrada no mapa', v_sem_mapa;
  end if;

  -- Prova por linha. Um alias só entra numa fusão se a origem do seu
  -- identificador puder ser reconstruída: ou o id é o hash de um título real
  -- que o próprio banco guarda, ou é a forma canônica declarada. Um alias sem
  -- prova reprova a chave inteira, não só a si mesmo.
  create temporary table tmp_alias on commit drop as
  select a.id as alias_id, a.group_id, a.source, a.source_conversation_id,
         a.first_seen_at, a.last_seen_at, m.canonical_key, m.canonical_label,
         (
           a.source_conversation_id = 'label:' || m.canonical_key
           or exists (
             select 1 from public.normalized_events e
             where e.conversation_id = a.source_conversation_id
               and a.source_conversation_id = 'wa_' || substr(
                 encode(extensions.digest(e.conversation_label, 'sha256'), 'hex'), 1, 32)
           )
         ) as provado
  from public.group_aliases a
  join tmp_mapa m on m.observed_label = a.observed_label
  where a.network_id = p_network_id;

  create temporary table tmp_chave on commit drop as
  select canonical_key,
         min(canonical_label) as canonical_label,
         count(*) as aliases,
         count(distinct group_id) as grupos,
         count(distinct source) as fontes,
         bool_and(provado) as todos_provados,
         min(first_seen_at) as first_seen_at,
         max(last_seen_at) as last_seen_at
  from tmp_alias group by canonical_key;

  -- Sobrevivente: o alias mais antigo da chave, desempatado pelo id do grupo
  -- para que o resultado não dependa da ordem de leitura. O mais antigo
  -- preserva o first_seen_at que a equipe já viu na tela.
  create temporary table tmp_sobrevivente on commit drop as
  select distinct on (a.canonical_key) a.canonical_key, a.group_id as survivor_group_id
  from tmp_alias a
  join tmp_chave c on c.canonical_key = a.canonical_key
  where c.todos_provados and c.fontes = 1 and c.grupos > 1
  order by a.canonical_key, a.first_seen_at, a.group_id;

  create temporary table tmp_fusao on commit drop as
  select distinct a.canonical_key, a.group_id as merged_group_id, s.survivor_group_id
  from tmp_alias a
  join tmp_sobrevivente s on s.canonical_key = a.canonical_key
  where a.group_id <> s.survivor_group_id;

  select count(*) into v_antes
  from public.groups where network_id = p_network_id and status = 'active';

  select coalesce(jsonb_agg(jsonb_build_object(
           'canonical_key', c.canonical_key,
           'survivor_group_id', s.survivor_group_id,
           'groups_merged', (select count(*) from tmp_fusao f where f.canonical_key = c.canonical_key),
           'aliases_repointed', (select count(*) from tmp_alias a
                                 join tmp_fusao f on f.merged_group_id = a.group_id
                                 where a.canonical_key = c.canonical_key)
         ) order by c.canonical_key), '[]'::jsonb)
    into v_plano
  from tmp_chave c join tmp_sobrevivente s on s.canonical_key = c.canonical_key;

  -- Chave recusada é resultado, não erro. Precisa aparecer no relatório com o
  -- motivo, porque uma recusa silenciosa deixaria inflação para trás.
  select coalesce(jsonb_agg(jsonb_build_object(
           'canonical_key', c.canonical_key,
           'groups', c.grupos,
           'reason', case
             when not c.todos_provados then 'alias sem derivação provada'
             when c.fontes > 1 then 'aliases de fontes diferentes'
             when c.grupos <= 1 then 'nada a fundir'
             else 'desconhecido' end
         ) order by c.canonical_key), '[]'::jsonb)
    into v_recusados
  from tmp_chave c
  where not exists (select 1 from tmp_sobrevivente s where s.canonical_key = c.canonical_key);

  if p_apply then
    insert into public.group_merge_map
      (network_id, merged_group_id, survivor_group_id, canonical_key, evidence)
    select p_network_id, f.merged_group_id, f.survivor_group_id, f.canonical_key,
           jsonb_build_object(
             'source_conversation_ids',
               (select jsonb_agg(a.source_conversation_id order by a.source_conversation_id)
                from tmp_alias a where a.group_id = f.merged_group_id),
             'proof', 'sha256(conversation_label) reproduz source_conversation_id',
             'policy', 'group_registry_consolidation@1')
    from tmp_fusao f
    on conflict (merged_group_id) do nothing;

    -- O source_conversation_id de cada alias é preservado: é a trilha de qual
    -- título gerou qual identificador, e apagá-la tornaria a fusão inauditável.
    update public.group_aliases a
       set group_id = f.survivor_group_id, updated_at = now()
      from tmp_fusao f
     where a.group_id = f.merged_group_id and a.network_id = p_network_id;

    update public.groups g
       set current_label = c.canonical_label,
           first_seen_at = least(g.first_seen_at, c.first_seen_at),
           last_seen_at = greatest(g.last_seen_at, c.last_seen_at),
           updated_at = now()
      from tmp_sobrevivente s
      join tmp_chave c on c.canonical_key = s.canonical_key
     where g.id = s.survivor_group_id and g.network_id = p_network_id;

    -- As linhas de métrica dos fundidos não são somadas: a chave primária é
    -- (execução, grupo) e somar à mão inventaria números. São apagadas, e as
    -- janelas voltam a ser processadas pelo caminho de produção, que é
    -- idempotente e é o mesmo código que será auditado depois.
    delete from public.group_metric_windows w
     using tmp_fusao f
     where w.group_id = f.merged_group_id and w.network_id = p_network_id;

    -- Arquivar, não excluir: enquanto a conferência não passa, o grupo antigo
    -- precisa continuar existindo para que o mapa possa ser desfeito.
    update public.groups g
       set status = 'archived', updated_at = now()
      from tmp_fusao f
     where g.id = f.merged_group_id and g.network_id = p_network_id;
  end if;

  -- No ensaio o "depois" é projeção, não leitura: relatar o presente como
  -- resultado faria o plano parecer inofensivo.
  if p_apply then
    select count(*) into v_depois
    from public.groups where network_id = p_network_id and status = 'active';
  else
    select v_antes - count(*) into v_depois from tmp_fusao;
  end if;

  return jsonb_build_object(
    'policy', 'group_registry_consolidation@1',
    'applied', p_apply,
    'active_groups_before', v_antes,
    'active_groups_after', v_depois,
    'merges', v_plano,
    'declined', v_recusados
  );
end;
$$;

revoke all on function private.consolidate_group_registry(uuid, jsonb, boolean) from public;
