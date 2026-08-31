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

