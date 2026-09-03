-- P1.1 capture coverage and run anchoring.
-- Additive and reversible: ingestion keeps working if these objects are dropped,
-- and the Edge Functions fall back to the previous RPC when v3 is absent.

-- 1. Append-only capture samples ---------------------------------------------
-- adapter_health keeps a single upserted row per device, so it can only prove
-- the last contact. Coverage of a 24 hour window needs the history itself.
create table public.capture_health_samples (
  heartbeat_id uuid primary key,
  network_id uuid not null references public.networks(id) on delete cascade,
  device_id uuid not null references public.source_devices(id) on delete cascade,
  source text not null check (source in ('fake', 'android_notification', 'waha')),
  observed_at timestamptz not null,
  status text not null check (status in ('healthy', 'degraded', 'offline_recovery')),
  outbox_pending integer not null check (outbox_pending >= 0),
  notification_access boolean,
  listener_connected boolean,
  whatsapp_installed boolean,
  network_type text check (network_type is null or network_type in ('wifi', 'cellular', 'offline', 'unknown')),
  adapter_version text not null check (char_length(adapter_version) between 1 and 64),
  received_at timestamptz not null default now()
);

create index capture_health_samples_network_observed_idx
  on public.capture_health_samples(network_id, observed_at desc);
create index capture_health_samples_device_observed_idx
  on public.capture_health_samples(device_id, observed_at desc);

alter table public.capture_health_samples enable row level security;
create policy capture_health_samples_select_member on public.capture_health_samples
  for select to authenticated using (private.is_network_member(network_id));
revoke all on public.capture_health_samples from anon, authenticated;
grant select on public.capture_health_samples to authenticated;

-- 2. Record every heartbeat as a sample ---------------------------------------
-- The insert is additive and conflict tolerant, so a repeated heartbeat id can
-- never make ingestion fail.
create or replace function private.record_capture_health_sample(p_heartbeat jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.capture_health_samples (
    heartbeat_id, network_id, device_id, source, observed_at, status, outbox_pending,
    notification_access, listener_connected, whatsapp_installed, network_type, adapter_version
  ) values (
    (p_heartbeat->>'heartbeat_id')::uuid,
    (p_heartbeat->>'network_id')::uuid,
    (p_heartbeat->>'device_id')::uuid,
    p_heartbeat->>'source',
    (p_heartbeat->>'observed_at')::timestamptz,
    p_heartbeat->>'status',
    (p_heartbeat->>'outbox_pending')::integer,
    (p_heartbeat->>'notification_access')::boolean,
    (p_heartbeat->>'listener_connected')::boolean,
    (p_heartbeat->>'whatsapp_installed')::boolean,
    p_heartbeat->>'network_type',
    p_heartbeat->>'adapter_version'
  )
  on conflict (heartbeat_id) do nothing;
$$;

revoke all on function private.record_capture_health_sample(jsonb) from public, anon, authenticated;

-- 3. Run level capture evidence and window provenance -------------------------
alter table public.processing_runs
  add column capture_confidence text check (
    capture_confidence is null or capture_confidence in ('high', 'moderate', 'low', 'unavailable')
  ),
  add column capture_coverage jsonb check (
    capture_coverage is null or jsonb_typeof(capture_coverage) = 'object'
  ),
  add column window_kind text not null default 'canonical_slot' check (
    window_kind in ('canonical_slot', 'manual_refresh')
  );

create index processing_runs_network_kind_ends_idx
  on public.processing_runs(network_id, window_kind, ends_at desc);

-- 4. persist_analysis_v3 = v2 plus the capture evidence of the run ------------
create or replace function public.persist_analysis_v3(p_analysis jsonb)
returns table (processing_run_id uuid, fact_count integer, signal_count integer, alert_count integer)
language plpgsql security definer set search_path = '' as $$
declare v_result record; v_run jsonb := p_analysis->'run';
begin
  if jsonb_typeof(p_analysis->'group_metrics') <> 'array' then raise exception 'invalid_group_metrics'; end if;
  select * into v_result from public.persist_analysis(p_analysis);

  update public.processing_runs set
    capture_confidence = nullif(v_run->>'capture_confidence', ''),
    capture_coverage = case
      when jsonb_typeof(v_run->'capture_coverage') = 'object' then v_run->'capture_coverage' else null end,
    window_kind = coalesce(nullif(v_run->>'window_kind', ''), 'canonical_slot')
  where processing_runs.id = v_result.processing_run_id;

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
revoke all on function public.persist_analysis_v3(jsonb) from public, anon, authenticated;
grant execute on function public.persist_analysis_v3(jsonb) to service_role;

-- 5. Heartbeats also feed the append-only coverage samples -------------------
-- Identical to the previous definition apart from the sample recording call.
create or replace function public.ingest_health_heartbeat(p_heartbeat jsonb)
returns table (updated boolean, stale boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
  v_previous public.adapter_health;
  v_kind text;
  v_summary text;
begin
  select * into v_previous from public.adapter_health
  where device_id = (p_heartbeat->>'device_id')::uuid;

  insert into public.adapter_health (
    device_id, heartbeat_id, network_id, source, observed_at, adapter_version,
    parser_version, status, outbox_pending, oldest_pending_at,
    last_event_captured_at, last_upload_succeeded_at, counters,
    notification_access, listener_connected, whatsapp_installed,
    last_whatsapp_notification_at, last_parsed_event_at, network_type, recovered_at
  ) values (
    (p_heartbeat->>'device_id')::uuid,
    (p_heartbeat->>'heartbeat_id')::uuid,
    (p_heartbeat->>'network_id')::uuid,
    p_heartbeat->>'source',
    (p_heartbeat->>'observed_at')::timestamptz,
    p_heartbeat->>'adapter_version',
    p_heartbeat->>'parser_version',
    p_heartbeat->>'status',
    (p_heartbeat->>'outbox_pending')::integer,
    nullif(p_heartbeat->>'oldest_pending_at', '')::timestamptz,
    nullif(p_heartbeat->>'last_event_captured_at', '')::timestamptz,
    nullif(p_heartbeat->>'last_upload_succeeded_at', '')::timestamptz,
    coalesce(p_heartbeat->'counters', '{}'::jsonb),
    (p_heartbeat->>'notification_access')::boolean,
    (p_heartbeat->>'listener_connected')::boolean,
    (p_heartbeat->>'whatsapp_installed')::boolean,
    nullif(p_heartbeat->>'last_whatsapp_notification_at', '')::timestamptz,
    nullif(p_heartbeat->>'last_parsed_event_at', '')::timestamptz,
    p_heartbeat->>'network_type',
    nullif(p_heartbeat->>'recovered_at', '')::timestamptz
  ) on conflict (device_id) do update set
    heartbeat_id = excluded.heartbeat_id,
    network_id = excluded.network_id,
    source = excluded.source,
    observed_at = excluded.observed_at,
    adapter_version = excluded.adapter_version,
    parser_version = excluded.parser_version,
    status = excluded.status,
    outbox_pending = excluded.outbox_pending,
    oldest_pending_at = excluded.oldest_pending_at,
    last_event_captured_at = excluded.last_event_captured_at,
    last_upload_succeeded_at = excluded.last_upload_succeeded_at,
    counters = excluded.counters,
    notification_access = excluded.notification_access,
    listener_connected = excluded.listener_connected,
    whatsapp_installed = excluded.whatsapp_installed,
    last_whatsapp_notification_at = excluded.last_whatsapp_notification_at,
    last_parsed_event_at = excluded.last_parsed_event_at,
    network_type = excluded.network_type,
    recovered_at = excluded.recovered_at,
    received_at = now()
  where excluded.observed_at >= public.adapter_health.observed_at;
  get diagnostics v_updated = row_count;

  if v_updated = 1 and (
    v_previous.device_id is null
    or v_previous.status is distinct from p_heartbeat->>'status'
    or v_previous.listener_connected is distinct from (p_heartbeat->>'listener_connected')::boolean
    or v_previous.notification_access is distinct from (p_heartbeat->>'notification_access')::boolean
    or v_previous.network_type is distinct from p_heartbeat->>'network_type'
    or (v_previous.outbox_pending = 0) is distinct from ((p_heartbeat->>'outbox_pending')::integer = 0)
  ) then
    v_kind := case
      when (p_heartbeat->>'notification_access')::boolean = false then 'setup_required'
      when (p_heartbeat->>'listener_connected')::boolean = false then 'listener_disconnected'
      when p_heartbeat->>'network_type' = 'offline' then 'network_offline'
      when (p_heartbeat->>'outbox_pending')::integer > 0 then 'queue_backlog'
      when v_previous.device_id is null then 'monitoring_started'
      when p_heartbeat->>'status' = 'offline_recovery' or v_previous.status <> 'healthy' then 'recovered'
      else 'degraded'
    end;
    v_summary := case v_kind
      when 'setup_required' then 'Acesso às notificações precisa ser verificado.'
      when 'listener_disconnected' then 'Captura interrompida; recuperação automática solicitada.'
      when 'network_offline' then 'Aparelho sem internet; dados serão mantidos na fila.'
      when 'queue_backlog' then 'Há dados aguardando sincronização.'
      when 'monitoring_started' then 'Monitoramento da captura iniciado.'
      when 'recovered' then 'Captura normalizada automaticamente.'
      else 'Captura operando com atenção.'
    end;
    insert into public.capture_health_transitions (
      network_id, device_id, occurred_at, kind, from_status, to_status, summary
    ) values (
      (p_heartbeat->>'network_id')::uuid,
      (p_heartbeat->>'device_id')::uuid,
      (p_heartbeat->>'observed_at')::timestamptz,
      v_kind, v_previous.status, p_heartbeat->>'status', v_summary
    );
  end if;

  -- P1.1: keep an append-only sample so capture coverage can be measured.
  perform private.record_capture_health_sample(p_heartbeat);

  return query select v_updated = 1, v_updated = 0;
end;
$$;

-- 6. Historical windows keep their real provenance -----------------------------
-- Runs created before P1.1 came from the read model refreshing on GET, not from
-- the canonical scheduler. Labelling them as canonical slots would let an
-- arbitrary window act as a trend comparator, so they are marked as legacy.
alter table public.processing_runs
  drop constraint processing_runs_window_kind_check;
alter table public.processing_runs
  add constraint processing_runs_window_kind_check check (
    window_kind in ('canonical_slot', 'manual_refresh', 'legacy_on_read')
  );

update public.processing_runs set window_kind = 'legacy_on_read'
where window_kind = 'canonical_slot'
  and not (
    extract(minute from ends_at) = 0
    and extract(second from ends_at) = 0
    and extract(hour from ends_at) in (11, 16, 21)
  );
