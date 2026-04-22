create schema if not exists tenant_demo;

create table if not exists tenant_demo.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  delivery_fee_fixed integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_demo.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  base_price integer not null default 0,
  category text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_demo.product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references tenant_demo.products(id),
  name text not null,
  type text not null default 'single' check (type in ('single', 'multiple', 'text')),
  is_required boolean not null default false,
  min_select integer not null default 0,
  max_select integer not null default 1
);

create table if not exists tenant_demo.product_option_values (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references tenant_demo.product_options(id),
  name text not null,
  price_delta integer not null default 0,
  is_active boolean not null default true
);

create table if not exists tenant_demo.combos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_demo.combo_items (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references tenant_demo.combos(id),
  product_id uuid not null references tenant_demo.products(id),
  quantity integer not null default 1,
  is_required boolean not null default true,
  group_name text,
  sort_order integer not null default 0
);

create table if not exists tenant_demo.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  type text not null default 'fixed_amount' check (type in ('fixed_amount', 'percentage', 'informational')),
  value integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_demo.menus (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references tenant_demo.locations(id),
  date date not null,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (location_id, date)
);

create table if not exists tenant_demo.menu_items (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references tenant_demo.menus(id),
  product_id uuid references tenant_demo.products(id),
  combo_id uuid references tenant_demo.combos(id),
  display_name text,
  price_override integer,
  available_quantity integer,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  check (
    (product_id is not null and combo_id is null)
    or (product_id is null and combo_id is not null)
  )
);
