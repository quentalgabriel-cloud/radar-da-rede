alter table public.group_aliases
  add column resolution_reason text not null default 'first_observation'
  check (char_length(resolution_reason) between 1 and 120);

update public.group_aliases
set resolution_reason = case resolution_status
  when 'ambiguous' then 'source_identity_label_changed'
  when 'confirmed' then 'operator_confirmed'
  when 'rejected' then 'operator_rejected'
  else 'first_observation'
end;

create or replace function private.set_group_alias_resolution_reason()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.resolution_status is distinct from old.resolution_status then
    new.resolution_reason := case new.resolution_status
      when 'confirmed' then 'operator_confirmed'
      when 'rejected' then 'operator_rejected'
      when 'ambiguous' then 'source_identity_label_changed'
      else 'automatic_resolution'
    end;
  elsif new.resolution_status = 'ambiguous' then
    new.resolution_reason := 'source_identity_label_changed';
  end if;
  return new;
end;
$$;

create trigger group_alias_resolution_reason
before insert or update of resolution_status on public.group_aliases
for each row execute function private.set_group_alias_resolution_reason();

create or replace function public.group_registry_summary(p_network_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null or not private.is_network_member(p_network_id) then
    raise exception 'not_authorized';
  end if;
  select jsonb_build_object(
    'groups', count(*),
    'unclassified', count(*) filter (where classification_status = 'unclassified'),
    'partially_classified', count(*) filter (where classification_status = 'partially_classified'),
    'confirmed_groups', count(*) filter (where classification_status = 'confirmed'),
    'automatic_aliases', (select count(*) from public.group_aliases where network_id = p_network_id and resolution_status = 'automatic'),
    'confirmed_aliases', (select count(*) from public.group_aliases where network_id = p_network_id and resolution_status = 'confirmed'),
    'ambiguous', (select count(*) from public.group_aliases where network_id = p_network_id and resolution_status = 'ambiguous'),
    'rejected', (select count(*) from public.group_aliases where network_id = p_network_id and resolution_status = 'rejected'),
    'collisions', (select count(*) from public.group_aliases where network_id = p_network_id and resolution_reason = 'source_identity_label_changed')
  ) into v_result from public.groups where network_id = p_network_id;
  return v_result;
end;
$$;

revoke all on function public.group_registry_summary(uuid) from public, anon;
grant execute on function public.group_registry_summary(uuid) to authenticated;
