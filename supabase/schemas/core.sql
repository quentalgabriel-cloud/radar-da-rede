-- Declarative schema for Radar da Rede.
-- Generate a clean migration with `supabase db diff` only after linking the
-- dedicated project. Do not apply this file to an unrelated project.

create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

create table public.networks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.network_members (
  network_id uuid not null references public.networks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'operator', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (network_id, user_id)
);

create index network_members_user_id_idx on public.network_members(user_id);

create table public.source_devices (
  id uuid primary key default gen_random_uuid(),
  network_id uuid not null references public.networks(id) on delete cascade,
  source text not null check (source in ('fake', 'android_notification', 'waha')),
  label text not null check (char_length(label) between 1 and 120),
  status text not null default 'active' check (status in ('active', 'paused', 'revoked')),
  created_at timestamptz not null default now()
);

create index source_devices_network_id_idx on public.source_devices(network_id);

create table public.device_credentials (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.source_devices(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_hint text not null check (char_length(token_hint) between 4 and 16),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index device_credentials_active_idx
  on public.device_credentials(token_hash)
  where revoked_at is null;
create index device_credentials_device_id_idx on public.device_credentials(device_id);

create table public.processing_credentials (
  id uuid primary key default gen_random_uuid(),
  network_id uuid not null references public.networks(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_hint text not null check (char_length(token_hint) between 4 and 16),
  label text not null check (char_length(label) between 1 and 120),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index processing_credentials_active_idx
  on public.processing_credentials(token_hash)
  where revoked_at is null;
create index processing_credentials_network_id_idx on public.processing_credentials(network_id);

create table public.ingest_batches (
  batch_id uuid primary key,
  network_id uuid not null references public.networks(id) on delete cascade,
  device_id uuid not null references public.source_devices(id) on delete cascade,
  schema_version text not null,
  sent_at timestamptz not null,
  received_at timestamptz not null default now(),
  accepted_events integer not null default 0 check (accepted_events >= 0),
  duplicate_events integer not null default 0 check (duplicate_events >= 0)
);

create index ingest_batches_network_received_idx
  on public.ingest_batches(network_id, received_at desc);
create index ingest_batches_device_id_idx on public.ingest_batches(device_id);

create table public.normalized_events (
  event_id uuid primary key,
  schema_version text not null check (schema_version = '0.1.0'),
  network_id uuid not null references public.networks(id) on delete cascade,
  device_id uuid not null references public.source_devices(id) on delete cascade,
  source text not null check (source in ('fake', 'android_notification', 'waha')),
  source_event_id text check (source_event_id is null or char_length(source_event_id) between 1 and 512),
  conversation_id text not null check (char_length(conversation_id) between 1 and 255),
  conversation_label text check (conversation_label is null or char_length(conversation_label) between 1 and 255),
  occurred_at timestamptz not null,
  captured_at timestamptz not null,
  message_type text not null check (
    message_type in ('text', 'image', 'video', 'audio', 'document', 'location', 'contact', 'system', 'unknown')
  ),
  text text check (text is null or char_length(text) <= 10000),
  sender_ref text check (sender_ref is null or char_length(sender_ref) between 1 and 255),
  reply_to_event_id uuid,
  parser_version text not null check (char_length(parser_version) between 1 and 64),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  ingested_at timestamptz not null default now(),
  check (message_type <> 'text' or char_length(text) >= 1)
);

create index normalized_events_network_occurred_idx
  on public.normalized_events(network_id, occurred_at desc);
create index normalized_events_conversation_occurred_idx
  on public.normalized_events(network_id, conversation_id, occurred_at desc);
create index normalized_events_device_id_idx on public.normalized_events(device_id);

create table public.adapter_health (
  device_id uuid primary key references public.source_devices(id) on delete cascade,
  heartbeat_id uuid not null unique,
  network_id uuid not null references public.networks(id) on delete cascade,
  source text not null check (source in ('fake', 'android_notification', 'waha')),
  observed_at timestamptz not null,
  adapter_version text not null check (char_length(adapter_version) between 1 and 64),
  parser_version text check (parser_version is null or char_length(parser_version) between 1 and 64),
  status text not null check (status in ('healthy', 'degraded', 'offline_recovery')),
  outbox_pending integer not null check (outbox_pending >= 0),
  oldest_pending_at timestamptz,
  last_event_captured_at timestamptz,
  last_upload_succeeded_at timestamptz,
  counters jsonb not null default '{}'::jsonb check (jsonb_typeof(counters) = 'object'),
  received_at timestamptz not null default now()
);

create index adapter_health_network_id_idx on public.adapter_health(network_id);

create table public.processing_runs (
  id uuid primary key default gen_random_uuid(),
  network_id uuid not null references public.networks(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  pipeline_version text not null check (char_length(pipeline_version) between 1 and 64),
  taxonomy_version text not null check (char_length(taxonomy_version) between 1 and 64),
  input_event_count integer not null check (input_event_count >= 0),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  completed_at timestamptz not null default now(),
  check (starts_at <= ends_at),
  unique (network_id, starts_at, ends_at, pipeline_version, input_hash)
);

create index processing_runs_network_completed_idx
  on public.processing_runs(network_id, completed_at desc);

create table public.facts (
  id uuid primary key,
  processing_run_id uuid not null references public.processing_runs(id) on delete cascade,
  network_id uuid not null references public.networks(id) on delete cascade,
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 255),
  taxonomy_version text not null,
  kind text not null,
  summary text not null,
  source_event_ids uuid[] not null check (cardinality(source_event_ids) > 0),
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (processing_run_id, dedupe_key)
);

create table public.signals (
  id uuid primary key,
  processing_run_id uuid not null references public.processing_runs(id) on delete cascade,
  network_id uuid not null references public.networks(id) on delete cascade,
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 255),
  rules_version text not null,
  kind text not null,
  summary text not null,
  source_event_ids uuid[] not null check (cardinality(source_event_ids) > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (starts_at <= ends_at),
  unique (processing_run_id, dedupe_key)
);

create table public.alerts (
  id uuid primary key,
  processing_run_id uuid not null references public.processing_runs(id) on delete cascade,
  network_id uuid not null references public.networks(id) on delete cascade,
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 255),
  rules_version text not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  kind text not null,
  title text not null,
  summary text not null,
  source_event_ids uuid[] not null check (cardinality(source_event_ids) > 0),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (processing_run_id, dedupe_key)
);

create index facts_network_occurred_idx on public.facts(network_id, occurred_at desc);
create index signals_network_ends_idx on public.signals(network_id, ends_at desc);
create index alerts_network_status_created_idx on public.alerts(network_id, status, created_at desc);

create or replace function private.is_network_member(target_network_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.network_members member
    where member.network_id = target_network_id
      and member.user_id = (select auth.uid())
  );
$$;

create or replace function public.ingest_event_batch(p_batch jsonb)
returns table (duplicate_batch boolean, accepted_events integer, duplicate_events integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_inserted integer;
  v_event_count integer;
  v_accepted integer;
begin
  if p_batch->>'schema_version' <> '0.1.0'
    or jsonb_typeof(p_batch->'events') <> 'array' then
    raise exception 'invalid_ingest_batch';
  end if;

  v_event_count := jsonb_array_length(p_batch->'events');
  if v_event_count < 1 or v_event_count > 500 then
    raise exception 'invalid_event_count';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_batch->'events') item
    where item->>'network_id' <> p_batch->>'network_id'
       or item->>'device_id' <> p_batch->>'device_id'
  ) then
    raise exception 'event_scope_mismatch';
  end if;

  insert into public.ingest_batches (
    batch_id, network_id, device_id, schema_version, sent_at
  ) values (
    (p_batch->>'batch_id')::uuid,
    (p_batch->>'network_id')::uuid,
    (p_batch->>'device_id')::uuid,
    p_batch->>'schema_version',
    (p_batch->>'sent_at')::timestamptz
  ) on conflict (batch_id) do nothing;
  get diagnostics v_batch_inserted = row_count;

  if v_batch_inserted = 0 then
    return query select true, 0, v_event_count;
    return;
  end if;

  insert into public.normalized_events (
    event_id, schema_version, network_id, device_id, source, source_event_id,
    conversation_id, conversation_label, occurred_at, captured_at,
    message_type, text, sender_ref, reply_to_event_id, parser_version, metadata
  )
  select
    (item->>'event_id')::uuid,
    item->>'schema_version',
    (item->>'network_id')::uuid,
    (item->>'device_id')::uuid,
    item->>'source',
    item->>'source_event_id',
    item->>'conversation_id',
    item->>'conversation_label',
    (item->>'occurred_at')::timestamptz,
    (item->>'captured_at')::timestamptz,
    item->>'message_type',
    item->>'text',
    item->>'sender_ref',
    nullif(item->>'reply_to_event_id', '')::uuid,
    item->>'parser_version',
    coalesce(item->'metadata', '{}'::jsonb)
  from jsonb_array_elements(p_batch->'events') item
  on conflict (event_id) do nothing;
  get diagnostics v_accepted = row_count;

  update public.ingest_batches
  set accepted_events = v_accepted,
      duplicate_events = v_event_count - v_accepted
  where batch_id = (p_batch->>'batch_id')::uuid;

  return query select false, v_accepted, v_event_count - v_accepted;
end;
$$;

create or replace function public.ingest_health_heartbeat(p_heartbeat jsonb)
returns table (updated boolean, stale boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  insert into public.adapter_health (
    device_id, heartbeat_id, network_id, source, observed_at, adapter_version,
    parser_version, status, outbox_pending, oldest_pending_at,
    last_event_captured_at, last_upload_succeeded_at, counters
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
    coalesce(p_heartbeat->'counters', '{}'::jsonb)
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
    received_at = now()
  where excluded.observed_at >= public.adapter_health.observed_at;
  get diagnostics v_updated = row_count;

  return query select v_updated = 1, v_updated = 0;
end;
$$;

create or replace function public.persist_analysis(p_analysis jsonb)
returns table (processing_run_id uuid, fact_count integer, signal_count integer, alert_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run jsonb := p_analysis->'run';
  v_run_id uuid;
  v_lock_key text;
  v_fact_count integer;
  v_signal_count integer;
  v_alert_count integer;
begin
  if jsonb_typeof(v_run) <> 'object'
    or jsonb_typeof(p_analysis->'facts') <> 'array'
    or jsonb_typeof(p_analysis->'signals') <> 'array'
    or jsonb_typeof(p_analysis->'alerts') <> 'array' then
    raise exception 'invalid_analysis_payload';
  end if;

  v_lock_key := concat_ws(':',
    v_run->>'network_id', v_run->>'starts_at', v_run->>'ends_at',
    v_run->>'pipeline_version', v_run->>'input_hash'
  );
  perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  insert into public.processing_runs (
    network_id, starts_at, ends_at, pipeline_version, taxonomy_version,
    input_event_count, input_hash
  ) values (
    (v_run->>'network_id')::uuid,
    (v_run->>'starts_at')::timestamptz,
    (v_run->>'ends_at')::timestamptz,
    v_run->>'pipeline_version',
    v_run->>'taxonomy_version',
    (v_run->>'input_event_count')::integer,
    v_run->>'input_hash'
  ) on conflict (network_id, starts_at, ends_at, pipeline_version, input_hash)
  do update set
    taxonomy_version = excluded.taxonomy_version,
    input_event_count = excluded.input_event_count,
    completed_at = now()
  returning id into v_run_id;

  delete from public.facts where facts.processing_run_id = v_run_id;
  delete from public.signals where signals.processing_run_id = v_run_id;
  delete from public.alerts where alerts.processing_run_id = v_run_id;

  insert into public.facts (
    id, processing_run_id, network_id, dedupe_key, taxonomy_version, kind,
    summary, source_event_ids, occurred_at, payload
  )
  select
    (item->>'id')::uuid, v_run_id, (v_run->>'network_id')::uuid,
    item->>'dedupe_key', v_run->>'taxonomy_version', item->>'kind',
    item->>'summary',
    array(select jsonb_array_elements_text(item->'source_event_ids'))::uuid[],
    (item->>'occurred_at')::timestamptz,
    coalesce(item->'payload', '{}'::jsonb)
  from jsonb_array_elements(p_analysis->'facts') item;
  get diagnostics v_fact_count = row_count;

  insert into public.signals (
    id, processing_run_id, network_id, dedupe_key, rules_version, kind,
    summary, source_event_ids, starts_at, ends_at, payload
  )
  select
    (item->>'id')::uuid, v_run_id, (v_run->>'network_id')::uuid,
    item->>'dedupe_key', v_run->>'pipeline_version', item->>'kind',
    item->>'summary',
    array(select jsonb_array_elements_text(item->'source_event_ids'))::uuid[],
    (item->>'starts_at')::timestamptz, (item->>'ends_at')::timestamptz,
    coalesce(item->'payload', '{}'::jsonb)
  from jsonb_array_elements(p_analysis->'signals') item;
  get diagnostics v_signal_count = row_count;

  insert into public.alerts (
    id, processing_run_id, network_id, dedupe_key, rules_version, severity,
    kind, title, summary, source_event_ids, status, payload
  )
  select
    (item->>'id')::uuid, v_run_id, (v_run->>'network_id')::uuid,
    item->>'dedupe_key', v_run->>'pipeline_version', item->>'severity',
    item->>'kind', item->>'title', item->>'summary',
    array(select jsonb_array_elements_text(item->'source_event_ids'))::uuid[],
    'open', coalesce(item->'payload', '{}'::jsonb)
  from jsonb_array_elements(p_analysis->'alerts') item;
  get diagnostics v_alert_count = row_count;

  return query select v_run_id, v_fact_count, v_signal_count, v_alert_count;
end;
$$;

alter table public.networks enable row level security;
alter table public.network_members enable row level security;
alter table public.source_devices enable row level security;
alter table public.device_credentials enable row level security;
alter table public.processing_credentials enable row level security;
alter table public.ingest_batches enable row level security;
alter table public.normalized_events enable row level security;
alter table public.adapter_health enable row level security;
alter table public.processing_runs enable row level security;
alter table public.facts enable row level security;
alter table public.signals enable row level security;
alter table public.alerts enable row level security;

create policy networks_select_member on public.networks
  for select to authenticated using (private.is_network_member(id));
create policy network_members_select_self on public.network_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy source_devices_select_member on public.source_devices
  for select to authenticated using (private.is_network_member(network_id));
create policy ingest_batches_select_member on public.ingest_batches
  for select to authenticated using (private.is_network_member(network_id));
create policy normalized_events_select_member on public.normalized_events
  for select to authenticated using (private.is_network_member(network_id));
create policy adapter_health_select_member on public.adapter_health
  for select to authenticated using (private.is_network_member(network_id));
create policy processing_runs_select_member on public.processing_runs
  for select to authenticated using (private.is_network_member(network_id));
create policy facts_select_member on public.facts
  for select to authenticated using (private.is_network_member(network_id));
create policy signals_select_member on public.signals
  for select to authenticated using (private.is_network_member(network_id));
create policy alerts_select_member on public.alerts
  for select to authenticated using (private.is_network_member(network_id));

revoke all on all tables in schema public from anon, authenticated;
grant select on public.networks, public.network_members, public.source_devices,
  public.ingest_batches, public.normalized_events, public.adapter_health,
  public.processing_runs, public.facts, public.signals, public.alerts to authenticated;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
revoke all on function private.is_network_member(uuid) from public, anon;
grant execute on function private.is_network_member(uuid) to authenticated;
revoke all on function public.ingest_event_batch(jsonb) from public, anon, authenticated;
revoke all on function public.ingest_health_heartbeat(jsonb) from public, anon, authenticated;
revoke all on function public.persist_analysis(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_event_batch(jsonb) to service_role;
grant execute on function public.ingest_health_heartbeat(jsonb) to service_role;
grant execute on function public.persist_analysis(jsonb) to service_role;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Capture health diagnostics (deployed migration 20260827185240)

alter table public.adapter_health
  add column notification_access boolean,
  add column listener_connected boolean,
  add column whatsapp_installed boolean,
  add column last_whatsapp_notification_at timestamptz,
  add column last_parsed_event_at timestamptz,
  add column network_type text check (network_type in ('wifi', 'cellular', 'offline', 'unknown')),
  add column recovered_at timestamptz;

create table public.capture_health_transitions (
  id uuid primary key default gen_random_uuid(),
  network_id uuid not null references public.networks(id) on delete cascade,
  device_id uuid not null references public.source_devices(id) on delete cascade,
  occurred_at timestamptz not null,
  kind text not null check (kind in (
    'monitoring_started', 'listener_disconnected', 'setup_required',
    'network_offline', 'queue_backlog', 'degraded', 'recovered'
  )),
  from_status text,
  to_status text not null,
  summary text not null check (char_length(summary) between 1 and 240),
  created_at timestamptz not null default now()
);

create index capture_health_transitions_network_occurred_idx
  on public.capture_health_transitions(network_id, occurred_at desc);

create table public.diagnostic_tests (
  id uuid primary key default gen_random_uuid(),
  network_id uuid not null references public.networks(id) on delete cascade,
  device_id uuid not null references public.source_devices(id) on delete cascade,
  started_by uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 seconds'),
  completed_at timestamptz,
  status text not null default 'waiting' check (status in ('waiting', 'pass', 'timeout')),
  matched_event_id uuid references public.normalized_events(event_id) on delete set null,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  failure_stage text check (failure_stage is null or failure_stage in (
    'device', 'notification_access', 'listener', 'parser', 'upload', 'unknown'
  )),
  check (expires_at > started_at),
  check ((status = 'pass') = (matched_event_id is not null))
);

create index diagnostic_tests_network_started_idx
  on public.diagnostic_tests(network_id, started_at desc);
create unique index diagnostic_tests_one_waiting_per_network_idx
  on public.diagnostic_tests(network_id) where status = 'waiting';

create or replace function public.start_capture_diagnostic(p_network_id uuid)
returns public.diagnostic_tests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device_id uuid;
  v_test public.diagnostic_tests;
begin
  if (select auth.uid()) is null or not private.is_network_member(p_network_id) then
    raise exception 'not_authorized';
  end if;

  update public.diagnostic_tests
  set status = 'timeout', completed_at = now(), failure_stage = 'unknown'
  where network_id = p_network_id and status = 'waiting' and expires_at <= now();

  select device.id into v_device_id
  from public.source_devices device
  left join public.adapter_health health on health.device_id = device.id
  where device.network_id = p_network_id and device.status = 'active'
  order by (device.source = 'android_notification') desc, health.observed_at desc nulls last
  limit 1;

  if v_device_id is null then raise exception 'active_device_not_found'; end if;

  insert into public.diagnostic_tests (network_id, device_id, started_by)
  values (p_network_id, v_device_id, (select auth.uid()))
  returning * into v_test;
  return v_test;
end;
$$;

create or replace function public.expire_capture_diagnostics(p_network_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if (select auth.uid()) is null or not private.is_network_member(p_network_id) then
    raise exception 'not_authorized';
  end if;

  update public.diagnostic_tests diagnostic
  set status = 'timeout',
      completed_at = now(),
      failure_stage = case
        when health.observed_at is null or health.observed_at < now() - interval '35 minutes' then 'device'
        when health.notification_access = false then 'notification_access'
        when health.listener_connected = false then 'listener'
        when health.last_whatsapp_notification_at >= diagnostic.started_at
          and (health.last_parsed_event_at is null or health.last_parsed_event_at < health.last_whatsapp_notification_at) then 'parser'
        when health.network_type = 'offline' or health.outbox_pending > 0 then 'upload'
        else 'unknown'
      end
  from public.adapter_health health
  where diagnostic.network_id = p_network_id
    and diagnostic.device_id = health.device_id
    and diagnostic.status = 'waiting'
    and diagnostic.expires_at <= now();
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

alter table public.capture_health_transitions enable row level security;
alter table public.diagnostic_tests enable row level security;

create policy capture_health_transitions_select_member on public.capture_health_transitions
  for select to authenticated using (private.is_network_member(network_id));
create policy diagnostic_tests_select_member on public.diagnostic_tests
  for select to authenticated using (private.is_network_member(network_id));

revoke all on public.capture_health_transitions, public.diagnostic_tests from anon, authenticated;
grant select on public.capture_health_transitions, public.diagnostic_tests to authenticated;

revoke all on function public.start_capture_diagnostic(uuid) from public, anon;
revoke all on function public.expire_capture_diagnostics(uuid) from public, anon;
grant execute on function public.start_capture_diagnostic(uuid) to authenticated;
grant execute on function public.expire_capture_diagnostics(uuid) to authenticated;

alter publication supabase_realtime add table public.adapter_health;
alter publication supabase_realtime add table public.diagnostic_tests;

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

  return query select v_updated = 1, v_updated = 0;
end;
$$;

create or replace function public.ingest_event_batch(p_batch jsonb)
returns table (duplicate_batch boolean, accepted_events integer, duplicate_events integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_inserted integer;
  v_event_count integer;
  v_accepted integer;
begin
  if p_batch->>'schema_version' <> '0.1.0'
    or jsonb_typeof(p_batch->'events') <> 'array' then
    raise exception 'invalid_ingest_batch';
  end if;
  v_event_count := jsonb_array_length(p_batch->'events');
  if v_event_count < 1 or v_event_count > 500 then raise exception 'invalid_event_count'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_batch->'events') item
    where item->>'network_id' <> p_batch->>'network_id'
       or item->>'device_id' <> p_batch->>'device_id'
  ) then raise exception 'event_scope_mismatch'; end if;

  insert into public.ingest_batches (batch_id, network_id, device_id, schema_version, sent_at)
  values ((p_batch->>'batch_id')::uuid, (p_batch->>'network_id')::uuid,
    (p_batch->>'device_id')::uuid, p_batch->>'schema_version', (p_batch->>'sent_at')::timestamptz)
  on conflict (batch_id) do nothing;
  get diagnostics v_batch_inserted = row_count;
  if v_batch_inserted = 0 then return query select true, 0, v_event_count; return; end if;

  insert into public.normalized_events (
    event_id, schema_version, network_id, device_id, source, source_event_id,
    conversation_id, conversation_label, occurred_at, captured_at,
    message_type, text, sender_ref, reply_to_event_id, parser_version, metadata
  ) select
    (item->>'event_id')::uuid, item->>'schema_version', (item->>'network_id')::uuid,
    (item->>'device_id')::uuid, item->>'source', item->>'source_event_id',
    item->>'conversation_id', item->>'conversation_label', (item->>'occurred_at')::timestamptz,
    (item->>'captured_at')::timestamptz, item->>'message_type', item->>'text', item->>'sender_ref',
    nullif(item->>'reply_to_event_id', '')::uuid, item->>'parser_version', coalesce(item->'metadata', '{}'::jsonb)
  from jsonb_array_elements(p_batch->'events') item on conflict (event_id) do nothing;
  get diagnostics v_accepted = row_count;

  update public.ingest_batches set accepted_events = v_accepted, duplicate_events = v_event_count - v_accepted
  where batch_id = (p_batch->>'batch_id')::uuid;

  with matched as (
    select diagnostic.id as diagnostic_id, event.event_id, event.captured_at
    from public.diagnostic_tests diagnostic
    join lateral (
      select candidate.event_id, candidate.captured_at
      from public.normalized_events candidate
      where candidate.network_id = diagnostic.network_id
        and candidate.device_id = diagnostic.device_id
        and candidate.captured_at >= diagnostic.started_at
      order by candidate.captured_at asc limit 1
    ) event on true
    where diagnostic.network_id = (p_batch->>'network_id')::uuid
      and diagnostic.device_id = (p_batch->>'device_id')::uuid
      and diagnostic.status = 'waiting'
      and diagnostic.expires_at > now()
  )
  update public.diagnostic_tests diagnostic
  set status = 'pass',
      completed_at = matched.captured_at,
      matched_event_id = matched.event_id,
      latency_ms = greatest(0, floor(extract(epoch from (matched.captured_at - diagnostic.started_at)) * 1000)::integer),
      failure_stage = null
  from matched where diagnostic.id = matched.diagnostic_id;

  return query select false, v_accepted, v_event_count - v_accepted;
end;
$$;


-- Diagnostic hardening (deployed migration 20260827185523)

revoke all on function public.start_capture_diagnostic(uuid) from public, anon, authenticated;
revoke all on function public.expire_capture_diagnostics(uuid) from public, anon, authenticated;
drop function public.start_capture_diagnostic(uuid);
drop function public.expire_capture_diagnostics(uuid);

create index capture_health_transitions_device_id_idx
  on public.capture_health_transitions(device_id);
create index diagnostic_tests_device_id_idx on public.diagnostic_tests(device_id);
create index diagnostic_tests_started_by_idx on public.diagnostic_tests(started_by);
create index diagnostic_tests_matched_event_id_idx
  on public.diagnostic_tests(matched_event_id) where matched_event_id is not null;

