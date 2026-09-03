create or replace function public.can_manage_group_registry(p_network_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and private.can_manage_network(p_network_id);
$$;
revoke all on function public.can_manage_group_registry(uuid) from public, anon;
grant execute on function public.can_manage_group_registry(uuid) to authenticated;
