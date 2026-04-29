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
  ('La Martina', 'la-martina', 'tenant_la_martina', 'active', 'America/Bogota', 'COP', true),
  ('Big Boy food', 'big-boy-food', 'tenant_big_boy_food', 'active', 'America/Bogota', 'COP', true)
on conflict (slug) do update set
  name = excluded.name,
  schema_name = excluded.schema_name,
  status = excluded.status,
  timezone = excluded.timezone,
  currency = excluded.currency,
  automation_enabled = excluded.automation_enabled,
  updated_at = now();

create schema if not exists tenant_la_martina;

create table if not exists tenant_la_martina.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  delivery_fee_fixed integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_la_martina.products (
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

create table if not exists tenant_la_martina.menus (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references tenant_la_martina.locations(id),
  date date not null,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (location_id, date)
);

create table if not exists tenant_la_martina.menu_items (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references tenant_la_martina.menus(id),
  product_id uuid references tenant_la_martina.products(id),
  combo_id uuid,
  display_name text,
  price_override integer,
  available_quantity integer,
  is_available boolean not null default true,
  sort_order integer not null default 0
);

insert into tenant_la_martina.locations (name, address, delivery_fee_fixed, is_active)
select 'Sede principal', 'Sede principal La Martina', 5000, true
where not exists (select 1 from tenant_la_martina.locations where name = 'Sede principal');

update tenant_la_martina.locations
set address = 'Sede principal La Martina',
  delivery_fee_fixed = 5000,
  is_active = true,
  updated_at = now()
where name = 'Sede principal';

insert into tenant_la_martina.products (name, description, base_price, category, image_url, is_active)
select 'Milanesa de pollo', 'Pollo apanado con arroz, ensalada y papas criollas.', 26000, 'almuerzos', null, true
where not exists (select 1 from tenant_la_martina.products where name = 'Milanesa de pollo');

insert into tenant_la_martina.products (name, description, base_price, category, image_url, is_active)
select 'Pasta carbonara', 'Pasta corta con salsa cremosa, tocineta y parmesano.', 28000, 'pastas', null, true
where not exists (select 1 from tenant_la_martina.products where name = 'Pasta carbonara');

insert into tenant_la_martina.products (name, description, base_price, category, image_url, is_active)
select 'Ensalada Martina', 'Mix verde con pollo grillado, aguacate, maiz y vinagreta de la casa.', 24000, 'ensaladas', null, true
where not exists (select 1 from tenant_la_martina.products where name = 'Ensalada Martina');

update tenant_la_martina.products
set description = 'Pollo apanado con arroz, ensalada y papas criollas.',
  base_price = 26000,
  category = 'almuerzos',
  is_active = true,
  updated_at = now()
where name = 'Milanesa de pollo';

update tenant_la_martina.products
set description = 'Pasta corta con salsa cremosa, tocineta y parmesano.',
  base_price = 28000,
  category = 'pastas',
  is_active = true,
  updated_at = now()
where name = 'Pasta carbonara';

update tenant_la_martina.products
set description = 'Mix verde con pollo grillado, aguacate, maiz y vinagreta de la casa.',
  base_price = 24000,
  category = 'ensaladas',
  is_active = true,
  updated_at = now()
where name = 'Ensalada Martina';

with location as (
  select id from tenant_la_martina.locations where name = 'Sede principal' limit 1
)
insert into tenant_la_martina.menus (location_id, date, name, status, published_at)
select id, current_date, 'Menu de hoy', 'published', now()
from location
on conflict (location_id, date) do update set
  name = excluded.name,
  status = 'published',
  published_at = now();

with menu as (
  select m.id from tenant_la_martina.menus m
  join tenant_la_martina.locations l on l.id = m.location_id
  where l.name = 'Sede principal' and m.date = current_date
  limit 1
)
delete from tenant_la_martina.menu_items mi
using menu
where mi.menu_id = menu.id;

with menu as (
  select m.id from tenant_la_martina.menus m
  join tenant_la_martina.locations l on l.id = m.location_id
  where l.name = 'Sede principal' and m.date = current_date
  limit 1
),
products as (
  select * from (values
    ('Milanesa de pollo'::text, 26000::integer, 10::integer),
    ('Pasta carbonara'::text, 28000::integer, 20::integer),
    ('Ensalada Martina'::text, 24000::integer, 30::integer)
  ) as product(name, price, sort_order)
)
insert into tenant_la_martina.menu_items (menu_id, product_id, display_name, price_override, is_available, sort_order)
select menu.id, p.id, p.name, products.price, true, products.sort_order
from menu
join products on true
join tenant_la_martina.products p on p.name = products.name;

create schema if not exists tenant_big_boy_food;

create table if not exists tenant_big_boy_food.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  delivery_fee_fixed integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_big_boy_food.products (
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

create table if not exists tenant_big_boy_food.menus (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references tenant_big_boy_food.locations(id),
  date date not null,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (location_id, date)
);

create table if not exists tenant_big_boy_food.menu_items (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references tenant_big_boy_food.menus(id),
  product_id uuid references tenant_big_boy_food.products(id),
  combo_id uuid,
  display_name text,
  price_override integer,
  available_quantity integer,
  is_available boolean not null default true,
  sort_order integer not null default 0
);

insert into tenant_big_boy_food.locations (name, address, delivery_fee_fixed, is_active)
select 'Sede principal', 'Sede principal Big Boy food', 6000, true
where not exists (select 1 from tenant_big_boy_food.locations where name = 'Sede principal');

update tenant_big_boy_food.locations
set address = 'Sede principal Big Boy food',
  delivery_fee_fixed = 6000,
  is_active = true,
  updated_at = now()
where name = 'Sede principal';

insert into tenant_big_boy_food.products (name, description, base_price, category, image_url, is_active)
select 'Big Boy burger', 'Hamburguesa doble carne, cheddar, tocineta y salsa Big Boy.', 32000, 'hamburguesas', null, true
where not exists (select 1 from tenant_big_boy_food.products where name = 'Big Boy burger');

insert into tenant_big_boy_food.products (name, description, base_price, category, image_url, is_active)
select 'Hot dog callejero', 'Perro caliente con papas trituradas, queso, tocineta y salsas.', 22000, 'perros', null, true
where not exists (select 1 from tenant_big_boy_food.products where name = 'Hot dog callejero');

insert into tenant_big_boy_food.products (name, description, base_price, category, image_url, is_active)
select 'Papas bacon cheddar', 'Papas francesas con queso cheddar fundido y bacon crocante.', 18000, 'acompanamientos', null, true
where not exists (select 1 from tenant_big_boy_food.products where name = 'Papas bacon cheddar');

update tenant_big_boy_food.products
set description = 'Hamburguesa doble carne, cheddar, tocineta y salsa Big Boy.',
  base_price = 32000,
  category = 'hamburguesas',
  is_active = true,
  updated_at = now()
where name = 'Big Boy burger';

update tenant_big_boy_food.products
set description = 'Perro caliente con papas trituradas, queso, tocineta y salsas.',
  base_price = 22000,
  category = 'perros',
  is_active = true,
  updated_at = now()
where name = 'Hot dog callejero';

update tenant_big_boy_food.products
set description = 'Papas francesas con queso cheddar fundido y bacon crocante.',
  base_price = 18000,
  category = 'acompanamientos',
  is_active = true,
  updated_at = now()
where name = 'Papas bacon cheddar';

with location as (
  select id from tenant_big_boy_food.locations where name = 'Sede principal' limit 1
)
insert into tenant_big_boy_food.menus (location_id, date, name, status, published_at)
select id, current_date, 'Menu de hoy', 'published', now()
from location
on conflict (location_id, date) do update set
  name = excluded.name,
  status = 'published',
  published_at = now();

with menu as (
  select m.id from tenant_big_boy_food.menus m
  join tenant_big_boy_food.locations l on l.id = m.location_id
  where l.name = 'Sede principal' and m.date = current_date
  limit 1
)
delete from tenant_big_boy_food.menu_items mi
using menu
where mi.menu_id = menu.id;

with menu as (
  select m.id from tenant_big_boy_food.menus m
  join tenant_big_boy_food.locations l on l.id = m.location_id
  where l.name = 'Sede principal' and m.date = current_date
  limit 1
),
products as (
  select * from (values
    ('Big Boy burger'::text, 32000::integer, 10::integer),
    ('Hot dog callejero'::text, 22000::integer, 20::integer),
    ('Papas bacon cheddar'::text, 18000::integer, 30::integer)
  ) as product(name, price, sort_order)
)
insert into tenant_big_boy_food.menu_items (menu_id, product_id, display_name, price_override, is_available, sort_order)
select menu.id, p.id, p.name, products.price, true, products.sort_order
from menu
join products on true
join tenant_big_boy_food.products p on p.name = products.name;

alter role authenticator set pgrst.db_schemas = 'public, graphql_public, control, tenant_demo, tenant_arepas, tenant_pizza, tenant_la_martina, tenant_big_boy_food';

grant usage on schema tenant_arepas to service_role;
grant usage on schema tenant_pizza to service_role;
grant usage on schema tenant_la_martina to service_role;
grant usage on schema tenant_big_boy_food to service_role;

grant all privileges on all tables in schema tenant_arepas to service_role;
grant all privileges on all tables in schema tenant_pizza to service_role;
grant all privileges on all tables in schema tenant_la_martina to service_role;
grant all privileges on all tables in schema tenant_big_boy_food to service_role;

grant all privileges on all sequences in schema tenant_arepas to service_role;
grant all privileges on all sequences in schema tenant_pizza to service_role;
grant all privileges on all sequences in schema tenant_la_martina to service_role;
grant all privileges on all sequences in schema tenant_big_boy_food to service_role;

alter default privileges in schema tenant_arepas grant all privileges on tables to service_role;
alter default privileges in schema tenant_pizza grant all privileges on tables to service_role;
alter default privileges in schema tenant_la_martina grant all privileges on tables to service_role;
alter default privileges in schema tenant_big_boy_food grant all privileges on tables to service_role;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
