create schema if not exists control;

create table if not exists control.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  schema_name text not null unique,
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),
  timezone text not null default 'America/Bogota',
  currency text not null default 'COP',
  automation_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists control.tenant_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references control.tenants(id),
  provider text not null check (provider in ('whatsapp_cloud')),
  phone_number_id text not null,
  waba_id text not null,
  display_phone_number text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  unique (provider, phone_number_id)
);

create table if not exists control.tenant_users (
  tenant_id uuid not null references control.tenants(id),
  user_id uuid not null,
  role text not null check (role in ('encargado', 'trabajador')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table if not exists control.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text,
  provider_message_id text,
  phone_number_id text,
  tenant_id uuid references control.tenants(id),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received', 'processed', 'duplicate', 'failed')),
  error_message text
);

create index if not exists webhook_events_phone_number_id_idx
  on control.webhook_events (phone_number_id);

create unique index if not exists webhook_events_provider_message_unique_idx
  on control.webhook_events (provider, provider_message_id)
  where provider_message_id is not null;
