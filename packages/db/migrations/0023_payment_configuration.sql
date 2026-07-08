insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-qrs',
  'payment-qrs',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  tenant_schema text;
begin
  for tenant_schema in
    select schema_name
    from (
      select 'tenant_demo'::text as schema_name
      union
      select distinct schema_name
      from control.tenants
      where schema_name like 'tenant_%'
    ) schemas
  loop
    if not exists (
      select 1
      from information_schema.tables
      where table_schema = tenant_schema
        and table_name = 'locations'
    ) then
      continue;
    end if;

    execute format(
      'create table if not exists %I.payment_accounts (
         id uuid primary key default gen_random_uuid(),
         location_id uuid not null references %I.locations(id),
         bank_name text not null,
         account_number text not null,
         holder_name text not null,
         is_active boolean not null default false,
         created_at timestamptz not null default now(),
         updated_at timestamptz not null default now(),
         check (length(btrim(bank_name)) > 0),
         check (length(btrim(account_number)) > 0),
         check (length(btrim(holder_name)) > 0)
       )',
      tenant_schema,
      tenant_schema
    );

    execute format(
      'create table if not exists %I.payment_qrs (
         id uuid primary key default gen_random_uuid(),
         location_id uuid not null references %I.locations(id),
         label text not null,
         storage_bucket text not null,
         storage_path text not null,
         mime_type text,
         is_active boolean not null default false,
         created_at timestamptz not null default now(),
         updated_at timestamptz not null default now(),
         check (length(btrim(label)) > 0),
         check (length(btrim(storage_bucket)) > 0),
         check (length(btrim(storage_path)) > 0)
       )',
      tenant_schema,
      tenant_schema
    );

    execute format(
      'create index if not exists %I on %I.payment_accounts (location_id)',
      tenant_schema || '_payment_accounts_location_idx',
      tenant_schema
    );

    execute format(
      'create index if not exists %I on %I.payment_qrs (location_id)',
      tenant_schema || '_payment_qrs_location_idx',
      tenant_schema
    );

    execute format(
      'create unique index if not exists %I on %I.payment_qrs (location_id) where is_active',
      tenant_schema || '_payment_qrs_single_active_idx',
      tenant_schema
    );

    execute format(
      'create or replace function %I.enforce_max_active_payment_accounts()
       returns trigger
       language plpgsql
       as $fn$
       begin
         if new.is_active then
           if (
             select count(*)
             from %I.payment_accounts
             where location_id = new.location_id
               and is_active = true
               and id <> coalesce(new.id, ''00000000-0000-0000-0000-000000000000''::uuid)
           ) >= 5 then
             raise exception ''accounts_active_limit_reached'';
           end if;
         end if;

         new.updated_at := now();
         return new;
       end;
       $fn$',
      tenant_schema,
      tenant_schema
    );

    execute format(
      'drop trigger if exists enforce_max_active_payment_accounts on %I.payment_accounts',
      tenant_schema
    );

    execute format(
      'create trigger enforce_max_active_payment_accounts
       before insert or update on %I.payment_accounts
       for each row
       execute function %I.enforce_max_active_payment_accounts()',
      tenant_schema,
      tenant_schema
    );

    execute format(
      'grant all on %I.payment_accounts to anon, authenticated, service_role',
      tenant_schema
    );

    execute format(
      'grant all on %I.payment_qrs to anon, authenticated, service_role',
      tenant_schema
    );

    execute format(
      'alter table %I.payment_accounts enable row level security',
      tenant_schema
    );

    execute format(
      'alter table %I.payment_qrs enable row level security',
      tenant_schema
    );

    if exists (
      select 1
      from information_schema.columns
      where table_schema = tenant_schema
        and table_name = 'locations'
        and column_name = 'transfer_payment_instructions'
    ) then
      execute format(
        'alter table %I.locations drop column transfer_payment_instructions',
        tenant_schema
      );
    end if;
  end loop;
end $$;

drop function if exists control.update_tenant_primary_location(text, text, text, text, integer, boolean, boolean, boolean, text);

create or replace function control.update_tenant_primary_location(
  p_schema_name text,
  p_name text default null,
  p_address text default null,
  p_phone text default null,
  p_delivery_fee_fixed integer default null,
  p_pickup_enabled boolean default null,
  p_delivery_enabled boolean default null,
  p_automation_enabled boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant_schema text := lower(trim(p_schema_name));
  location_id uuid;
  location_payload jsonb;
begin
  if tenant_schema !~ '^tenant_[a-z0-9_]{2,56}$' then
    raise exception 'invalid_tenant_schema';
  end if;

  if to_regclass(format('%I.locations', tenant_schema)) is null then
    raise exception 'tenant_locations_missing';
  end if;

  execute format(
    'select id
     from %I.locations
     order by created_at asc
     limit 1',
    tenant_schema
  )
  into location_id;

  if location_id is null then
    execute format(
      'insert into %I.locations (
         name,
         address,
         phone,
         delivery_fee_fixed,
         pickup_enabled,
         delivery_enabled,
         automation_enabled,
         is_active
       )
       values (
         coalesce(nullif($1, ''''), ''Sede principal''),
         nullif($2, ''''),
         nullif($3, ''''),
         coalesce($4, 0),
         coalesce($5, true),
         coalesce($6, true),
         coalesce($7, true),
         true
       )
       returning id',
      tenant_schema
    )
    into location_id
    using p_name, p_address, p_phone, p_delivery_fee_fixed, p_pickup_enabled, p_delivery_enabled, p_automation_enabled;
  else
    execute format(
      'update %I.locations
       set
         name = case when $2 is null then name else coalesce(nullif($2, ''''), ''Sede principal'') end,
         address = case when $3 is null then address else nullif($3, '''') end,
         phone = case when $4 is null then phone else nullif($4, '''') end,
         delivery_fee_fixed = coalesce($5, delivery_fee_fixed),
         pickup_enabled = coalesce($6, pickup_enabled),
         delivery_enabled = coalesce($7, delivery_enabled),
         automation_enabled = coalesce($8, automation_enabled),
         updated_at = now()
       where id = $1',
      tenant_schema
    )
    using location_id, p_name, p_address, p_phone, p_delivery_fee_fixed, p_pickup_enabled, p_delivery_enabled, p_automation_enabled;
  end if;

  execute format(
    'select to_jsonb(l)
     from %I.locations l
     where l.id = $1',
    tenant_schema
  )
  into location_payload
  using location_id;

  return location_payload;
end;
$$;

revoke all on function control.update_tenant_primary_location(text, text, text, text, integer, boolean, boolean, boolean) from public;
revoke all on function control.update_tenant_primary_location(text, text, text, text, integer, boolean, boolean, boolean) from anon;
revoke all on function control.update_tenant_primary_location(text, text, text, text, integer, boolean, boolean, boolean) from authenticated;
grant execute on function control.update_tenant_primary_location(text, text, text, text, integer, boolean, boolean, boolean) to service_role;

notify pgrst, 'reload schema';
