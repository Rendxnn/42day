do $$
declare
  tenant record;
begin
  for tenant in
    select schema_name
    from control.tenants
    where to_regclass(format('%I.products', schema_name)) is not null
  loop
    execute format(
      'alter table %I.products
         add column if not exists product_type text not null default ''simple''',
      tenant.schema_name
    );

    execute format(
      'alter table %I.products
         drop constraint if exists products_product_type_check',
      tenant.schema_name
    );

    execute format(
      'alter table %I.products
         add constraint products_product_type_check
         check (product_type in (''simple'', ''composite''))',
      tenant.schema_name
    );

    execute format(
      'create table if not exists %I.product_options (
         id uuid primary key default gen_random_uuid(),
         product_id uuid not null references %I.products(id),
         name text not null,
         type text not null default ''single'' check (type in (''single'', ''multiple'', ''text'')),
         is_required boolean not null default false,
         min_select integer not null default 0,
         max_select integer not null default 1
       )',
      tenant.schema_name,
      tenant.schema_name
    );

    execute format(
      'create table if not exists %I.product_option_values (
         id uuid primary key default gen_random_uuid(),
         option_id uuid not null references %I.product_options(id),
         name text not null,
         price_delta integer not null default 0,
         is_active boolean not null default true
       )',
      tenant.schema_name,
      tenant.schema_name
    );

    execute format(
      'alter table %I.product_options
         add column if not exists code text,
         add column if not exists description text,
         add column if not exists aliases jsonb not null default ''[]''::jsonb,
         add column if not exists sort_order integer not null default 0,
         add column if not exists display_mode text not null default ''list''',
      tenant.schema_name
    );

    execute format(
      'alter table %I.product_option_values
         add column if not exists code text,
         add column if not exists description text,
         add column if not exists aliases jsonb not null default ''[]''::jsonb,
         add column if not exists sort_order integer not null default 0',
      tenant.schema_name
    );

    execute format(
      'create index if not exists %I on %I.product_options (product_id, sort_order)',
      tenant.schema_name || '_product_options_product_sort_idx',
      tenant.schema_name
    );

    execute format(
      'create index if not exists %I on %I.product_option_values (option_id, sort_order)',
      tenant.schema_name || '_product_option_values_option_sort_idx',
      tenant.schema_name
    );
  end loop;
end $$;
