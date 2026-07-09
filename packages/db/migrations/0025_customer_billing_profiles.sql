do $$
declare
  tenant_schema text;
begin
  for tenant_schema in
    select distinct schema_name
    from control.tenants
    where schema_name like 'tenant_%'
    union
    select 'tenant_demo'
  loop
    if to_regclass(format('%I.customers', tenant_schema)) is not null then
      execute format(
        'create table if not exists %I.customer_billing_profiles (
           id uuid primary key default gen_random_uuid(),
           customer_id uuid not null references %I.customers(id),
           billing_type text not null check (billing_type in (''normal'', ''electronic'')),
           full_name text,
           billing_address text,
           legal_name text,
           tax_id text,
           email text,
           created_at timestamptz not null default now(),
           updated_at timestamptz not null default now(),
           constraint customer_billing_profiles_billing_fields_check check (
             (billing_type = ''normal'' and full_name is not null and nullif(trim(full_name), '''') is not null)
             or
             (
               billing_type = ''electronic''
               and legal_name is not null and nullif(trim(legal_name), '''') is not null
               and tax_id is not null and nullif(trim(tax_id), '''') is not null
               and email is not null and nullif(trim(email), '''') is not null
             )
           )
         )',
        tenant_schema,
        tenant_schema
      );

      execute format(
        'create unique index if not exists customer_billing_profiles_customer_type_idx
           on %I.customer_billing_profiles (customer_id, billing_type)',
        tenant_schema
      );

      execute format(
        'alter table %I.draft_orders
           add column if not exists billing_type text,
           add column if not exists billing_profile_id uuid references %I.customer_billing_profiles(id),
           add column if not exists billing_full_name text,
           add column if not exists billing_address text,
           add column if not exists billing_legal_name text,
           add column if not exists billing_tax_id text,
           add column if not exists billing_email text',
        tenant_schema,
        tenant_schema
      );

      execute format(
        'alter table %I.orders
           add column if not exists billing_type text,
           add column if not exists billing_profile_id uuid references %I.customer_billing_profiles(id),
           add column if not exists billing_full_name text,
           add column if not exists billing_address text,
           add column if not exists billing_legal_name text,
           add column if not exists billing_tax_id text,
           add column if not exists billing_email text',
        tenant_schema,
        tenant_schema
      );

      execute format(
        'alter table %I.draft_orders
           drop constraint if exists draft_orders_billing_type_check',
        tenant_schema
      );

      execute format(
        'alter table %I.orders
           drop constraint if exists orders_billing_type_check',
        tenant_schema
      );

      execute format(
        'alter table %I.draft_orders
           add constraint draft_orders_billing_type_check
           check (billing_type is null or billing_type in (''normal'', ''electronic''))',
        tenant_schema
      );

      execute format(
        'alter table %I.orders
           add constraint orders_billing_type_check
           check (billing_type is null or billing_type in (''normal'', ''electronic''))',
        tenant_schema
      );

      execute format(
        'create index if not exists draft_orders_billing_profile_id_idx on %I.draft_orders (billing_profile_id)',
        tenant_schema
      );

      execute format(
        'create index if not exists orders_billing_profile_id_idx on %I.orders (billing_profile_id)',
        tenant_schema
      );
    end if;
  end loop;
end $$;

alter table tenant_demo.customer_billing_profiles enable row level security;

notify pgrst, 'reload schema';
