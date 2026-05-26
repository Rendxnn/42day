alter table tenant_demo.locations
  add column if not exists pickup_enabled boolean not null default true,
  add column if not exists delivery_enabled boolean not null default true,
  add column if not exists automation_enabled boolean not null default true,
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7),
  add column if not exists opening_hours jsonb not null default '{}'::jsonb,
  add column if not exists coverage_config jsonb not null default '{"type":"none"}'::jsonb,
  add column if not exists transfer_payment_instructions text;

create table if not exists tenant_demo.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references tenant_demo.customers(id),
  label text,
  address_text text not null,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  raw_location_payload jsonb,
  source text not null default 'text' check (source in ('text', 'whatsapp_location', 'dashboard')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table tenant_demo.draft_orders
  add column if not exists delivery_address_id uuid references tenant_demo.customer_addresses(id);

alter table tenant_demo.orders
  add column if not exists delivery_address_id uuid references tenant_demo.customer_addresses(id);

create index if not exists customer_addresses_customer_id_idx on tenant_demo.customer_addresses (customer_id);
create index if not exists draft_orders_delivery_address_id_idx on tenant_demo.draft_orders (delivery_address_id);
create index if not exists orders_delivery_address_id_idx on tenant_demo.orders (delivery_address_id);
