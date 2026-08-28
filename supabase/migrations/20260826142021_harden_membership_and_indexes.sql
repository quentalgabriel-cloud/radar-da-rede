create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

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

revoke all on function private.is_network_member(uuid) from public, anon;
grant execute on function private.is_network_member(uuid) to authenticated;

drop policy networks_select_member on public.networks;
create policy networks_select_member on public.networks
  for select to authenticated using (private.is_network_member(id));

drop policy source_devices_select_member on public.source_devices;
create policy source_devices_select_member on public.source_devices
  for select to authenticated using (private.is_network_member(network_id));

drop policy ingest_batches_select_member on public.ingest_batches;
create policy ingest_batches_select_member on public.ingest_batches
  for select to authenticated using (private.is_network_member(network_id));

drop policy normalized_events_select_member on public.normalized_events;
create policy normalized_events_select_member on public.normalized_events
  for select to authenticated using (private.is_network_member(network_id));

drop policy adapter_health_select_member on public.adapter_health;
create policy adapter_health_select_member on public.adapter_health
  for select to authenticated using (private.is_network_member(network_id));

drop policy processing_runs_select_member on public.processing_runs;
create policy processing_runs_select_member on public.processing_runs
  for select to authenticated using (private.is_network_member(network_id));

drop policy facts_select_member on public.facts;
create policy facts_select_member on public.facts
  for select to authenticated using (private.is_network_member(network_id));

drop policy signals_select_member on public.signals;
create policy signals_select_member on public.signals
  for select to authenticated using (private.is_network_member(network_id));

drop policy alerts_select_member on public.alerts;
create policy alerts_select_member on public.alerts
  for select to authenticated using (private.is_network_member(network_id));

drop function public.is_network_member(uuid);

create index if not exists network_members_user_id_idx on public.network_members(user_id);
create index if not exists device_credentials_device_id_idx on public.device_credentials(device_id);
create index if not exists processing_credentials_network_id_idx on public.processing_credentials(network_id);
create index if not exists ingest_batches_device_id_idx on public.ingest_batches(device_id);
create index if not exists normalized_events_device_id_idx on public.normalized_events(device_id);
create index if not exists adapter_health_network_id_idx on public.adapter_health(network_id);
