insert into control.tenants (
  name,
  slug,
  schema_name,
  status,
  timezone,
  currency,
  automation_enabled
)
values
  ('Arepas del Parque', 'arepas', 'tenant_arepas', 'active', 'America/Bogota', 'COP', true),
  ('Pizza Norte', 'pizza', 'tenant_pizza', 'active', 'America/Bogota', 'COP', true)
on conflict (slug) do update set
  name = excluded.name,
  schema_name = excluded.schema_name,
  status = excluded.status,
  timezone = excluded.timezone,
  currency = excluded.currency,
  automation_enabled = excluded.automation_enabled;

create schema if not exists tenant_arepas;

create table if not exists tenant_arepas.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  delivery_fee_fixed integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_arepas.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  base_price integer not null default 0,
  category text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_arepas.menus (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references tenant_arepas.locations(id),
  date date not null,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (location_id, date)
);

create table if not exists tenant_arepas.menu_items (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references tenant_arepas.menus(id),
  product_id uuid references tenant_arepas.products(id),
  combo_id uuid,
  display_name text,
  price_override integer,
  available_quantity integer,
  is_available boolean not null default true,
  sort_order integer not null default 0
);

insert into tenant_arepas.locations (name, address, delivery_fee_fixed, is_active)
select 'Sede principal', 'Parque principal', 4000, true
where not exists (select 1 from tenant_arepas.locations where name = 'Sede principal');

insert into tenant_arepas.products (name, description, base_price, category, image_url, is_active)
select 'Arepa mixta', 'Arepa asada con carne desmechada, pollo y queso.', 16000, 'arepas', null, true
where not exists (select 1 from tenant_arepas.products where name = 'Arepa mixta');

insert into tenant_arepas.products (name, description, base_price, category, image_url, is_active)
select 'Arepa de queso', 'Arepa clasica con queso doble.', 9500, 'arepas', null, true
where not exists (select 1 from tenant_arepas.products where name = 'Arepa de queso');

with location as (
  select id from tenant_arepas.locations where name = 'Sede principal' limit 1
)
insert into tenant_arepas.menus (location_id, date, name, status, published_at)
select id, current_date, 'Menu de hoy', 'published', now()
from location
on conflict (location_id, date) do update set
  status = excluded.status,
  published_at = excluded.published_at;

with menu as (
  select m.id from tenant_arepas.menus m
  join tenant_arepas.locations l on l.id = m.location_id
  where l.name = 'Sede principal' and m.date = current_date
  limit 1
),
product as (
  select id, name, base_price from tenant_arepas.products where name = 'Arepa mixta' limit 1
)
insert into tenant_arepas.menu_items (menu_id, product_id, display_name, price_override, is_available, sort_order)
select menu.id, product.id, product.name, product.base_price, true, 10
from menu, product
where not exists (
  select 1 from tenant_arepas.menu_items mi
  where mi.menu_id = menu.id and mi.product_id = product.id
);

create schema if not exists tenant_pizza;

create table if not exists tenant_pizza.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  delivery_fee_fixed integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_pizza.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  base_price integer not null default 0,
  category text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_pizza.menus (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references tenant_pizza.locations(id),
  date date not null,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (location_id, date)
);

create table if not exists tenant_pizza.menu_items (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references tenant_pizza.menus(id),
  product_id uuid references tenant_pizza.products(id),
  combo_id uuid,
  display_name text,
  price_override integer,
  available_quantity integer,
  is_available boolean not null default true,
  sort_order integer not null default 0
);

insert into tenant_pizza.locations (name, address, delivery_fee_fixed, is_active)
select 'Sede principal', 'Zona norte', 6000, true
where not exists (select 1 from tenant_pizza.locations where name = 'Sede principal');

insert into tenant_pizza.products (name, description, base_price, category, image_url, is_active)
select 'Pizza personal pepperoni', 'Masa artesanal, mozzarella y pepperoni.', 22000, 'pizzas', null, true
where not exists (select 1 from tenant_pizza.products where name = 'Pizza personal pepperoni');

insert into tenant_pizza.products (name, description, base_price, category, image_url, is_active)
select 'Pizza vegetariana', 'Champinones, pimenton, cebolla y aceitunas.', 24000, 'pizzas', null, true
where not exists (select 1 from tenant_pizza.products where name = 'Pizza vegetariana');

with location as (
  select id from tenant_pizza.locations where name = 'Sede principal' limit 1
)
insert into tenant_pizza.menus (location_id, date, name, status, published_at)
select id, current_date, 'Menu de hoy', 'published', now()
from location
on conflict (location_id, date) do update set
  status = excluded.status,
  published_at = excluded.published_at;

with menu as (
  select m.id from tenant_pizza.menus m
  join tenant_pizza.locations l on l.id = m.location_id
  where l.name = 'Sede principal' and m.date = current_date
  limit 1
),
product as (
  select id, name, base_price from tenant_pizza.products where name = 'Pizza personal pepperoni' limit 1
)
insert into tenant_pizza.menu_items (menu_id, product_id, display_name, price_override, is_available, sort_order)
select menu.id, product.id, product.name, product.base_price, true, 10
from menu, product
where not exists (
  select 1 from tenant_pizza.menu_items mi
  where mi.menu_id = menu.id and mi.product_id = product.id
);
