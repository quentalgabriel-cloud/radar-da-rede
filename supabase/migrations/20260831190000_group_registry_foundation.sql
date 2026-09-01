-- P0 group registry foundation for the active operation.
-- Additive and reversible: existing ingestion and read model do not depend on these tables.

create or replace function private.can_manage_network(target_network_id uuid)
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
      and member.role in ('owner', 'operator')
  );
$$;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  network_id uuid not null references public.networks(id) on delete cascade,
  current_label text not null check (char_length(current_label) between 1 and 255),
  origin text not null default 'unknown' check (origin in ('legacy', 'current_operation', 'unknown')),
  context_type text check (context_type is null or context_type in (
    'territory', 'leadership', 'project', 'theme', 'community', 'event', 'organic', 'other'
  )),
  context_label text check (context_label is null or char_length(context_label) between 1 and 255),
  municipality text check (municipality is null or char_length(municipality) between 1 and 160),
  territory text check (territory is null or char_length(territory) between 1 and 160),
  primary_steward_label text check (
    primary_steward_label is null or char_length(primary_steward_label) between 1 and 160
  ),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  naming_status text not null default 'observed' check (
    naming_status in ('observed', 'approved', 'noncompliant')
  ),
  classification_status text not null default 'unclassified' check (
    classification_status in ('unclassified', 'partially_classified', 'confirmed')
  ),
  classification_source text not null default 'observed' check (
    classification_source in ('observed', 'manual', 'suggested', 'imported')
  ),
  classified_by uuid references auth.users(id) on delete set null,
  classified_at timestamptz,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (first_seen_at <= last_seen_at),
  check ((classification_status = 'unclassified') or classified_at is not null)
);

create index groups_network_status_idx on public.groups(network_id, status);
create index groups_network_classification_idx
  on public.groups(network_id, classification_status, last_seen_at desc);

create table public.group_aliases (
  id uuid primary key default gen_random_uuid(),
  network_id uuid not null references public.networks(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  source text not null check (source in ('fake', 'android_notification', 'waha')),
  source_conversation_id text not null check (char_length(source_conversation_id) between 1 and 255),
  observed_label text not null check (char_length(observed_label) between 1 and 255),
  normalized_label text not null check (char_length(normalized_label) between 1 and 255),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  resolution_status text not null default 'automatic' check (
    resolution_status in ('automatic', 'confirmed', 'ambiguous', 'rejected')
  ),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (first_seen_at <= last_seen_at),
  unique (network_id, source, source_conversation_id, normalized_label)
);

create index group_aliases_group_id_idx on public.group_aliases(group_id);
create index group_aliases_resolution_idx
  on public.group_aliases(network_id, resolution_status, last_seen_at desc);
create index group_aliases_source_conversation_idx
  on public.group_aliases(network_id, source, source_conversation_id);

create table public.group_classification_changes (
  id uuid primary key default gen_random_uuid(),
  network_id uuid not null references public.networks(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  field_name text not null check (field_name in (
    'origin', 'context_type', 'context_label', 'municipality', 'territory',
    'primary_steward_label', 'status', 'naming_status', 'classification_status'
  )),
  previous_value jsonb,
  new_value jsonb,
  change_source text not null check (change_source in ('manual', 'suggested', 'imported')),
  check (previous_value is distinct from new_value)
);

create index group_classification_changes_group_changed_idx
  on public.group_classification_changes(group_id, changed_at desc);
create index group_classification_changes_network_changed_idx
  on public.group_classification_changes(network_id, changed_at desc);

alter table public.groups enable row level security;
alter table public.group_aliases enable row level security;
alter table public.group_classification_changes enable row level security;

revoke all on function private.can_manage_network(uuid) from public, anon, authenticated;

create policy groups_select_member on public.groups
  for select to authenticated using (private.is_network_member(network_id));
create policy group_aliases_select_member on public.group_aliases
  for select to authenticated using (private.is_network_member(network_id));
create policy group_classification_changes_select_member on public.group_classification_changes
  for select to authenticated using (private.is_network_member(network_id));

revoke all on public.groups, public.group_aliases, public.group_classification_changes
  from anon, authenticated;
grant select on public.groups, public.group_aliases, public.group_classification_changes
  to authenticated;

create or replace function public.classify_group(p_group_id uuid, p_changes jsonb)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
  v_updated public.groups;
  v_key text;
  v_allowed constant text[] := array[
    'origin', 'context_type', 'context_label', 'municipality', 'territory',
    'primary_steward_label', 'status', 'naming_status', 'classification_status'
  ];
begin
  if (select auth.uid()) is null then raise exception 'not_authorized'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'invalid_group_changes';
  end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if not (v_key = any(v_allowed)) then raise exception 'invalid_group_field'; end if;
  end loop;

  select * into v_group from public.groups where id = p_group_id for update;
  if v_group.id is null or not private.can_manage_network(v_group.network_id) then
    raise exception 'not_authorized';
  end if;

  select * into v_updated
  from jsonb_populate_record(
    v_group,
    p_changes || jsonb_build_object(
      'classification_source', 'manual',
      'classified_by', (select auth.uid()),
      'classified_at', now(),
      'updated_at', now()
    )
  );

  update public.groups
  set origin = v_updated.origin,
      context_type = v_updated.context_type,
      context_label = v_updated.context_label,
      municipality = v_updated.municipality,
      territory = v_updated.territory,
      primary_steward_label = v_updated.primary_steward_label,
      status = v_updated.status,
      naming_status = v_updated.naming_status,
      classification_status = v_updated.classification_status,
      classification_source = 'manual',
      classified_by = (select auth.uid()),
      classified_at = now(),
      updated_at = now()
  where id = p_group_id
  returning * into v_updated;

  insert into public.group_classification_changes (
    network_id, group_id, changed_by, field_name, previous_value, new_value, change_source
  )
  select
    v_group.network_id, p_group_id, (select auth.uid()), change.key,
    to_jsonb(v_group)->change.key, to_jsonb(v_updated)->change.key, 'manual'
  from jsonb_each(p_changes) change
  where (to_jsonb(v_group)->change.key) is distinct from (to_jsonb(v_updated)->change.key);

  return v_updated;
end;
$$;

create or replace function public.review_group_alias(
  p_alias_id uuid,
  p_resolution_status text,
  p_group_id uuid default null
)
returns public.group_aliases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alias public.group_aliases;
  v_target_group_id uuid;
begin
  if (select auth.uid()) is null or p_resolution_status not in ('confirmed', 'rejected') then
    raise exception 'invalid_alias_review';
  end if;
  select * into v_alias from public.group_aliases where id = p_alias_id for update;
  if v_alias.id is null or not private.can_manage_network(v_alias.network_id) then
    raise exception 'not_authorized';
  end if;

  v_target_group_id := coalesce(p_group_id, v_alias.group_id);
  if not exists (
    select 1 from public.groups
    where id = v_target_group_id and network_id = v_alias.network_id
  ) then raise exception 'invalid_group_target'; end if;

  update public.group_aliases
  set group_id = v_target_group_id,
      resolution_status = p_resolution_status,
      confidence = case when p_resolution_status = 'confirmed' then 1 else 0 end,
      updated_at = now()
  where id = p_alias_id
  returning * into v_alias;
  return v_alias;
end;
$$;

create or replace function public.resolve_group_observations(
  p_network_id uuid,
  p_observations jsonb
)
returns table (
  observation_key text,
  group_id uuid,
  resolution_status text,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_source text;
  v_conversation_id text;
  v_label text;
  v_normalized_label text;
  v_observed_at timestamptz;
  v_alias public.group_aliases;
  v_group_id uuid;
  v_prior_source_count integer;
begin
  if p_observations is null or jsonb_typeof(p_observations) <> 'array'
    or jsonb_array_length(p_observations) > 500 then
    raise exception 'invalid_group_observations';
  end if;
  if not exists (select 1 from public.networks where id = p_network_id) then
    raise exception 'network_not_found';
  end if;

  for v_item in select * from jsonb_array_elements(p_observations) loop
    v_source := v_item->>'source';
    v_conversation_id := v_item->>'source_conversation_id';
    v_label := v_item->>'observed_label';
    v_normalized_label := v_item->>'normalized_label';
    v_observed_at := (v_item->>'observed_at')::timestamptz;
    if v_source not in ('fake', 'android_notification', 'waha')
      or coalesce(char_length(v_conversation_id), 0) not between 1 and 255
      or coalesce(char_length(v_label), 0) not between 1 and 255
      or coalesce(char_length(v_normalized_label), 0) not between 1 and 255
      or v_observed_at is null then
      raise exception 'invalid_group_observation';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
      concat_ws(':', p_network_id::text, v_source, v_conversation_id, v_normalized_label), 0
    ));

    select * into v_alias
    from public.group_aliases alias
    where alias.network_id = p_network_id
      and alias.source = v_source
      and alias.source_conversation_id = v_conversation_id
      and alias.normalized_label = v_normalized_label
    for update;

    if v_alias.id is not null then
      update public.group_aliases
      set observed_label = v_label,
          last_seen_at = greatest(last_seen_at, v_observed_at),
          updated_at = now()
      where id = v_alias.id
      returning * into v_alias;
      update public.groups
      set last_seen_at = greatest(last_seen_at, v_observed_at),
          updated_at = now()
      where id = v_alias.group_id;
      observation_key := v_source || ':' || v_conversation_id || ':' || v_normalized_label;
      group_id := v_alias.group_id;
      resolution_status := v_alias.resolution_status;
      created := false;
      return next;
      continue;
    end if;

    select count(*) into v_prior_source_count
    from public.group_aliases alias
    where alias.network_id = p_network_id
      and alias.source = v_source
      and alias.source_conversation_id = v_conversation_id
      and alias.resolution_status <> 'rejected';

    insert into public.groups (
      network_id, current_label, origin, classification_status, classification_source,
      first_seen_at, last_seen_at
    ) values (
      p_network_id, v_label, 'unknown', 'unclassified', 'observed',
      v_observed_at, v_observed_at
    ) returning id into v_group_id;

    insert into public.group_aliases (
      network_id, group_id, source, source_conversation_id, observed_label,
      normalized_label, first_seen_at, last_seen_at, resolution_status, confidence
    ) values (
      p_network_id, v_group_id, v_source, v_conversation_id, v_label,
      v_normalized_label, v_observed_at, v_observed_at,
      case when v_prior_source_count = 0 then 'automatic' else 'ambiguous' end,
      case when v_prior_source_count = 0 then 0.950 else 0.500 end
    ) returning * into v_alias;

    observation_key := v_source || ':' || v_conversation_id || ':' || v_normalized_label;
    group_id := v_group_id;
    resolution_status := v_alias.resolution_status;
    created := true;
    return next;
  end loop;
end;
$$;

revoke all on function public.classify_group(uuid, jsonb) from public, anon;
revoke all on function public.review_group_alias(uuid, text, uuid) from public, anon;
revoke all on function public.resolve_group_observations(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.classify_group(uuid, jsonb) to authenticated;
grant execute on function public.review_group_alias(uuid, text, uuid) to authenticated;
grant execute on function public.resolve_group_observations(uuid, jsonb) to service_role;
