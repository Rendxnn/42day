create or replace function control.provision_restaurant_tenant(
  p_name text,
  p_slug text,
  p_schema_name text,
  p_timezone text default 'America/Bogota',
  p_currency text default 'COP',
  p_status text default 'active',
  p_automation_enabled boolean default true,
  p_location_name text default 'Sede principal',
  p_location_address text default null,
  p_location_phone text default null,
  p_delivery_fee_fixed integer default 0
)
returns table (
  id uuid,
  name text,
  slug text,
  schema_name text,
  status text,
  timezone text,
  currency text,
  automation_enabled boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  template_schema constant text := 'tenant_demo';
  tenant_schema text := lower(trim(p_schema_name));
  normalized_slug text := lower(trim(p_slug));
  tenant_id uuid;
  location_id uuid;
  schemas_csv text;
  table_record record;
  fk_record record;
  remapped_fk text;
begin
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'restaurant_name_required';
  end if;

  if normalized_slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then
    raise exception 'invalid_restaurant_slug';
  end if;

  if tenant_schema !~ '^tenant_[a-z0-9_]{2,56}$' then
    raise exception 'invalid_tenant_schema';
  end if;

  if p_status not in ('active', 'inactive', 'suspended') then
    raise exception 'invalid_tenant_status';
  end if;

  if not exists (select 1 from pg_namespace where nspname = template_schema) then
    raise exception 'template_schema_missing';
  end if;

  if exists (
    select 1
    from control.tenants t
    where t.slug = normalized_slug
       or t.schema_name = tenant_schema
  ) then
    raise exception 'restaurant_slug_or_schema_exists';
  end if;

  if exists (select 1 from pg_namespace where nspname = tenant_schema) then
    raise exception 'tenant_schema_already_exists';
  end if;

  insert into control.tenants (
    name,
    slug,
    schema_name,
    status,
    timezone,
    currency,
    automation_enabled
  )
  values (
    trim(p_name),
    normalized_slug,
    tenant_schema,
    p_status,
    coalesce(nullif(trim(p_timezone), ''), 'America/Bogota'),
    coalesce(nullif(trim(p_currency), ''), 'COP'),
    coalesce(p_automation_enabled, true)
  )
  returning control.tenants.id into tenant_id;

  execute format('create schema %I', tenant_schema);

  for table_record in
    select table_name
    from information_schema.tables
    where table_schema = template_schema
      and table_type = 'BASE TABLE'
    order by table_name
  loop
    execute format(
      'create table %I.%I (like %I.%I including all)',
      tenant_schema,
      table_record.table_name,
      template_schema,
      table_record.table_name
    );
  end loop;

  for fk_record in
    select
      c.conname,
      rel.relname as table_name,
      pg_get_constraintdef(c.oid) as definition
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where c.contype = 'f'
      and nsp.nspname = template_schema
    order by rel.relname, c.conname
  loop
    if not exists (
      select 1
      from pg_constraint existing
      join pg_class existing_rel on existing_rel.oid = existing.conrelid
      join pg_namespace existing_nsp on existing_nsp.oid = existing_rel.relnamespace
      where existing.conname = fk_record.conname
        and existing_rel.relname = fk_record.table_name
        and existing_nsp.nspname = tenant_schema
    ) then
      remapped_fk := replace(
        fk_record.definition,
        template_schema || '.',
        format('%I.', tenant_schema)
      );

      execute format(
        'alter table %I.%I add constraint %I %s',
        tenant_schema,
        fk_record.table_name,
        fk_record.conname,
        remapped_fk
      );
    end if;
  end loop;

  for table_record in
    select table_name
    from information_schema.tables
    where table_schema = tenant_schema
      and table_type = 'BASE TABLE'
    order by table_name
  loop
    execute format('alter table %I.%I enable row level security', tenant_schema, table_record.table_name);
  end loop;

  execute format('grant usage on schema %I to service_role, authenticated', tenant_schema);
  execute format('grant all privileges on all tables in schema %I to service_role', tenant_schema);
  execute format('grant all privileges on all routines in schema %I to service_role', tenant_schema);
  execute format('grant all privileges on all sequences in schema %I to service_role', tenant_schema);
  execute format('grant select on all tables in schema %I to authenticated', tenant_schema);
  execute format('alter default privileges in schema %I grant all privileges on tables to service_role', tenant_schema);
  execute format('alter default privileges in schema %I grant all privileges on routines to service_role', tenant_schema);
  execute format('alter default privileges in schema %I grant all privileges on sequences to service_role', tenant_schema);

  if exists (
    select 1
    from information_schema.tables
    where table_schema = tenant_schema
      and table_name = 'orders'
  ) then
    execute format('drop policy if exists "tenant members can read realtime orders" on %I.orders', tenant_schema);
    execute format(
      'create policy "tenant members can read realtime orders" on %I.orders
         for select
         to authenticated
         using (
           exists (
             select 1
             from control.tenant_users tu
             where tu.tenant_id = %L::uuid
               and tu.user_id = (select auth.uid())
               and tu.status = ''active''
           )
         )',
      tenant_schema,
      tenant_id
    );

    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = tenant_schema
          and tablename = 'orders'
      )
    then
      execute format('alter publication supabase_realtime add table %I.orders', tenant_schema);
    end if;
  end if;

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
     values (%L, %L, %L, %s, true, true, %L, true)
     returning id',
    tenant_schema,
    coalesce(nullif(trim(p_location_name), ''), 'Sede principal'),
    nullif(trim(coalesce(p_location_address, '')), ''),
    nullif(trim(coalesce(p_location_phone, '')), ''),
    greatest(coalesce(p_delivery_fee_fixed, 0), 0),
    coalesce(p_automation_enabled, true)
  )
  into location_id;

  execute format(
    'insert into %I.menus (location_id, date, name, status, published_at)
     values (%L::uuid, current_date, ''Menu de hoy'', ''published'', now())
     on conflict (location_id, date) do nothing',
    tenant_schema,
    location_id
  );

  notify pgrst, 'reload schema';

  return query
  select
    t.id,
    t.name,
    t.slug,
    t.schema_name,
    t.status,
    t.timezone,
    t.currency,
    t.automation_enabled
  from control.tenants t
  where t.id = tenant_id;
end;
$$;

revoke all on function control.provision_restaurant_tenant(text, text, text, text, text, text, boolean, text, text, text, integer) from public;
revoke all on function control.provision_restaurant_tenant(text, text, text, text, text, text, boolean, text, text, text, integer) from anon;
revoke all on function control.provision_restaurant_tenant(text, text, text, text, text, text, boolean, text, text, text, integer) from authenticated;
grant execute on function control.provision_restaurant_tenant(text, text, text, text, text, text, boolean, text, text, text, integer) to service_role;

create or replace function control.get_tenant_admin_snapshot(
  p_schema_name text,
  p_timezone text default 'America/Bogota'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant_schema text := lower(trim(p_schema_name));
  business_date date := ((now() at time zone coalesce(nullif(trim(p_timezone), ''), 'America/Bogota'))::date);
  location_payload jsonb := null;
  active_product_count integer := 0;
  today_menu_item_count integer := 0;
  orders_today_count integer := 0;
  pending_order_count integer := 0;
  completed_today_count integer := 0;
  revenue_today integer := 0;
  last_order_at timestamptz := null;
begin
  if tenant_schema !~ '^tenant_[a-z0-9_]{2,56}$' then
    raise exception 'invalid_tenant_schema';
  end if;

  if to_regclass(format('%I.locations', tenant_schema)) is not null then
    execute format(
      'select to_jsonb(l)
       from %I.locations l
       order by l.created_at asc
       limit 1',
      tenant_schema
    )
    into location_payload;
  end if;

  if to_regclass(format('%I.products', tenant_schema)) is not null then
    execute format('select count(*)::integer from %I.products where is_active = true', tenant_schema)
    into active_product_count;
  end if;

  if to_regclass(format('%I.menu_items', tenant_schema)) is not null
    and to_regclass(format('%I.menus', tenant_schema)) is not null
    and to_regclass(format('%I.locations', tenant_schema)) is not null
  then
    execute format(
      'select count(mi.id)::integer
       from %I.menu_items mi
       join %I.menus m on m.id = mi.menu_id
       join %I.locations l on l.id = m.location_id
       where m.date = $1
         and m.status = ''published''
         and mi.is_available = true
         and l.is_active = true',
      tenant_schema,
      tenant_schema,
      tenant_schema
    )
    into today_menu_item_count
    using business_date;
  end if;

  if to_regclass(format('%I.orders', tenant_schema)) is not null then
    execute format(
      'select
         count(*)::integer,
         count(*) filter (where status in (''new'', ''pending_restaurant_confirmation'', ''needs_customer_replacement''))::integer,
         count(*) filter (where status = ''delivered'')::integer,
         coalesce(sum(total) filter (where status <> ''cancelled''), 0)::integer
       from %I.orders
       where created_at >= $1::date
         and created_at < ($1::date + interval ''1 day'')',
      tenant_schema
    )
    into orders_today_count, pending_order_count, completed_today_count, revenue_today
    using business_date;

    execute format('select max(created_at) from %I.orders', tenant_schema)
    into last_order_at;
  end if;

  return jsonb_build_object(
    'location', location_payload,
    'metrics', jsonb_build_object(
      'activeProductCount', active_product_count,
      'todayMenuItemCount', today_menu_item_count,
      'ordersTodayCount', orders_today_count,
      'pendingOrderCount', pending_order_count,
      'completedTodayCount', completed_today_count,
      'revenueToday', revenue_today,
      'lastOrderAt', last_order_at
    )
  );
end;
$$;

revoke all on function control.get_tenant_admin_snapshot(text, text) from public;
revoke all on function control.get_tenant_admin_snapshot(text, text) from anon;
revoke all on function control.get_tenant_admin_snapshot(text, text) from authenticated;
grant execute on function control.get_tenant_admin_snapshot(text, text) to service_role;

create or replace function control.update_tenant_primary_location(
  p_schema_name text,
  p_name text default null,
  p_address text default null,
  p_phone text default null,
  p_delivery_fee_fixed integer default null,
  p_pickup_enabled boolean default null,
  p_delivery_enabled boolean default null,
  p_automation_enabled boolean default null,
  p_transfer_payment_instructions text default null
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
         transfer_payment_instructions = case when $9 is null then transfer_payment_instructions else nullif($9, '''') end,
         updated_at = now()
       where id = $1',
      tenant_schema
    )
    using location_id, p_name, p_address, p_phone, p_delivery_fee_fixed, p_pickup_enabled, p_delivery_enabled, p_automation_enabled, p_transfer_payment_instructions;
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

revoke all on function control.update_tenant_primary_location(text, text, text, text, integer, boolean, boolean, boolean, text) from public;
revoke all on function control.update_tenant_primary_location(text, text, text, text, integer, boolean, boolean, boolean, text) from anon;
revoke all on function control.update_tenant_primary_location(text, text, text, text, integer, boolean, boolean, boolean, text) from authenticated;
grant execute on function control.update_tenant_primary_location(text, text, text, text, integer, boolean, boolean, boolean, text) to service_role;

notify pgrst, 'reload schema';
