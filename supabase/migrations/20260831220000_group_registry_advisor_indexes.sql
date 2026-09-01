-- Cover the auth-user foreign keys used by group classification and its audit trail.
create index groups_classified_by_idx on public.groups(classified_by);
create index group_classification_changes_changed_by_idx
  on public.group_classification_changes(changed_by);
