create table control.nfc_handoff_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (length(token_hash) = 64),
  unit_id uuid not null references control.dynamic_link_units(id) on delete restrict,
  actor_user_id uuid not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  reported_uid text,
  reported_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index nfc_handoff_sessions_active_token_idx on control.nfc_handoff_sessions (token_hash, expires_at) where used_at is null;
alter table control.nfc_handoff_sessions enable row level security;
alter table control.nfc_handoff_sessions force row level security;
revoke all on table control.nfc_handoff_sessions from anon, authenticated;
grant all on table control.nfc_handoff_sessions to service_role;
