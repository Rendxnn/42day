create table control.dynamic_link_bulk_operations (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  actor_user_id uuid not null,
  command_hash text not null check (length(command_hash) = 64),
  result jsonb not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now()
);

alter table control.dynamic_link_audit_events add column if not exists bulk_operation_id uuid references control.dynamic_link_bulk_operations(id) on delete restrict;
create index dynamic_link_audit_events_bulk_operation_idx on control.dynamic_link_audit_events (bulk_operation_id) where bulk_operation_id is not null;
alter table control.dynamic_link_bulk_operations enable row level security;
alter table control.dynamic_link_bulk_operations force row level security;
revoke all on table control.dynamic_link_bulk_operations from anon, authenticated;
grant all on table control.dynamic_link_bulk_operations to service_role;
