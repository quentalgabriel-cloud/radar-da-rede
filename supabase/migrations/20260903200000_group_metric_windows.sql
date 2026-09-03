alter table public.networks
  add column group_control_center_enabled boolean not null default false;

create table public.group_metric_windows (
  processing_run_id uuid not null references public.processing_runs(id) on delete cascade,
  network_id uuid not null references public.networks(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  event_count integer not null check (event_count >= 0),
  fact_count integer not null check (fact_count >= 0),
  alert_count integer not null check (alert_count >= 0),
  demand_count integer not null check (demand_count >= 0),
  agenda_count integer not null check (agenda_count >= 0),
  problem_count integer not null check (problem_count >= 0),
  open_situation_count integer not null check (open_situation_count >= 0),
  critical_situation_count integer not null check (critical_situation_count >= 0),
  capture_confidence text not null check (capture_confidence in ('high','moderate','low','unavailable')),
  metrics_version text not null,
  created_at timestamptz not null default now(),
  primary key (processing_run_id, group_id),
  check (starts_at <= ends_at)
);
create index group_metric_windows_group_ends_idx on public.group_metric_windows(group_id, ends_at desc);
create index group_metric_windows_network_ends_idx on public.group_metric_windows(network_id, ends_at desc);
alter table public.group_metric_windows enable row level security;
create policy group_metric_windows_select_member on public.group_metric_windows
  for select to authenticated using (private.is_network_member(network_id));
revoke all on public.group_metric_windows from anon, authenticated;
grant select on public.group_metric_windows to authenticated;

create or replace function public.persist_analysis_v2(p_analysis jsonb)
returns table (processing_run_id uuid, fact_count integer, signal_count integer, alert_count integer)
language plpgsql security definer set search_path = '' as $$
declare v_result record; v_run jsonb := p_analysis->'run';
begin
  if jsonb_typeof(p_analysis->'group_metrics') <> 'array' then raise exception 'invalid_group_metrics'; end if;
  select * into v_result from public.persist_analysis(p_analysis);
  delete from public.group_metric_windows where group_metric_windows.processing_run_id = v_result.processing_run_id;
  insert into public.group_metric_windows (
    processing_run_id, network_id, group_id, starts_at, ends_at, event_count, fact_count,
    alert_count, demand_count, agenda_count, problem_count, open_situation_count, critical_situation_count,
    capture_confidence, metrics_version
  ) select
    v_result.processing_run_id, (v_run->>'network_id')::uuid, (item->>'group_id')::uuid,
    (v_run->>'starts_at')::timestamptz, (v_run->>'ends_at')::timestamptz,
    (item->>'event_count')::integer, (item->>'fact_count')::integer,
    (item->>'alert_count')::integer, (item->>'demand_count')::integer,
    (item->>'agenda_count')::integer, (item->>'problem_count')::integer,
    (item->>'open_situation_count')::integer, coalesce((item->>'critical_situation_count')::integer, 0),
    item->>'capture_confidence', item->>'metrics_version'
  from jsonb_array_elements(p_analysis->'group_metrics') item
  join public.groups g on g.id=(item->>'group_id')::uuid and g.network_id=(v_run->>'network_id')::uuid;
  return query select v_result.processing_run_id, v_result.fact_count, v_result.signal_count, v_result.alert_count;
end; $$;
revoke all on function public.persist_analysis_v2(jsonb) from public, anon, authenticated;
grant execute on function public.persist_analysis_v2(jsonb) to service_role;
