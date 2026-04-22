create table if not exists tenant_demo.customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text,
  default_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_demo.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references tenant_demo.customers(id),
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  state text not null default 'new',
  current_draft_order_id uuid,
  manual_reason text,
  last_inbound_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_demo.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references tenant_demo.conversations(id),
  direction text not null check (direction in ('inbound', 'outbound')),
  provider text not null default 'whatsapp_cloud',
  provider_message_id text,
  message_type text not null default 'unknown',
  text text,
  payload jsonb,
  status text not null default 'logged',
  created_at timestamptz not null default now()
);

create unique index if not exists messages_provider_message_unique_idx
  on tenant_demo.messages (provider, provider_message_id, direction)
  where provider_message_id is not null;

create table if not exists tenant_demo.draft_orders (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references tenant_demo.conversations(id),
  customer_id uuid not null references tenant_demo.customers(id),
  location_id uuid references tenant_demo.locations(id),
  status text not null default 'draft',
  fulfillment_type text check (fulfillment_type in ('delivery', 'pickup')),
  delivery_address text,
  payment_method text check (payment_method in ('cash', 'transfer')),
  subtotal integer not null default 0,
  delivery_fee integer not null default 0,
  discount_total integer not null default 0,
  total integer not null default 0,
  validation_errors jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table tenant_demo.conversations
  drop constraint if exists conversations_current_draft_order_id_fkey;

alter table tenant_demo.conversations
  add constraint conversations_current_draft_order_id_fkey
  foreign key (current_draft_order_id)
  references tenant_demo.draft_orders(id);

create table if not exists tenant_demo.draft_order_items (
  id uuid primary key default gen_random_uuid(),
  draft_order_id uuid not null references tenant_demo.draft_orders(id),
  menu_item_id uuid references tenant_demo.menu_items(id),
  product_id uuid references tenant_demo.products(id),
  combo_id uuid references tenant_demo.combos(id),
  name_snapshot text not null,
  quantity integer not null,
  unit_price integer not null,
  options_snapshot jsonb,
  notes text,
  line_total integer not null
);

create table if not exists tenant_demo.orders (
  id uuid primary key default gen_random_uuid(),
  draft_order_id uuid references tenant_demo.draft_orders(id),
  customer_id uuid not null references tenant_demo.customers(id),
  location_id uuid references tenant_demo.locations(id),
  status text not null default 'new',
  fulfillment_type text not null check (fulfillment_type in ('delivery', 'pickup')),
  delivery_address text,
  payment_method text not null check (payment_method in ('cash', 'transfer')),
  payment_proof_file_id uuid,
  subtotal integer not null,
  delivery_fee integer not null,
  discount_total integer not null default 0,
  total integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_demo.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references tenant_demo.orders(id),
  product_id uuid references tenant_demo.products(id),
  combo_id uuid references tenant_demo.combos(id),
  name_snapshot text not null,
  quantity integer not null,
  unit_price integer not null,
  options_snapshot jsonb,
  notes text,
  line_total integer not null
);

create table if not exists tenant_demo.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references tenant_demo.conversations(id),
  message_id uuid references tenant_demo.messages(id),
  draft_order_id uuid references tenant_demo.draft_orders(id),
  order_id uuid references tenant_demo.orders(id),
  storage_bucket text not null,
  storage_path text not null,
  provider_media_id text,
  mime_type text,
  file_size integer,
  status text not null default 'received' check (status in ('received', 'stored', 'review_pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);

alter table tenant_demo.orders
  drop constraint if exists orders_payment_proof_file_id_fkey;

alter table tenant_demo.orders
  add constraint orders_payment_proof_file_id_fkey
  foreign key (payment_proof_file_id)
  references tenant_demo.payment_proofs(id);

create table if not exists tenant_demo.human_intervention_alerts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references tenant_demo.conversations(id),
  draft_order_id uuid references tenant_demo.draft_orders(id),
  order_id uuid references tenant_demo.orders(id),
  type text not null,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  title text not null,
  description text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists tenant_demo.app_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references tenant_demo.conversations(id),
  draft_order_id uuid references tenant_demo.draft_orders(id),
  order_id uuid references tenant_demo.orders(id),
  event_name text not null,
  severity text not null default 'info',
  source text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists conversations_state_idx on tenant_demo.conversations (state);
create index if not exists conversations_expires_at_idx on tenant_demo.conversations (expires_at);
create index if not exists orders_status_idx on tenant_demo.orders (status);
create index if not exists human_intervention_alerts_status_idx on tenant_demo.human_intervention_alerts (status);
create index if not exists app_events_event_name_idx on tenant_demo.app_events (event_name);
