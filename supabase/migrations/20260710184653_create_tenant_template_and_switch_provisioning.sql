do $$
declare
  source_schema constant text := 'tenant_demo';
  target_schema constant text := 'tenant_template';
  table_record record;
  fk_record record;
  remapped_fk text;
begin
  if not exists (select 1 from pg_namespace where nspname = source_schema) then
    raise exception 'source_template_schema_missing';
  end if;

  execute format('create schema if not exists %I', target_schema);

  for table_record in
    select table_name
    from information_schema.tables
    where table_schema = source_schema
      and table_type = 'BASE TABLE'
    order by table_name
  loop
    execute format(
      'create table if not exists %I.%I (like %I.%I including all)',
      target_schema,
      table_record.table_name,
      source_schema,
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
      and nsp.nspname = source_schema
    order by rel.relname, c.conname
  loop
    if not exists (
      select 1
      from pg_constraint existing
      join pg_class existing_rel on existing_rel.oid = existing.conrelid
      join pg_namespace existing_nsp on existing_nsp.oid = existing_rel.relnamespace
      where existing.conname = fk_record.conname
        and existing_rel.relname = fk_record.table_name
        and existing_nsp.nspname = target_schema
    ) then
      remapped_fk := replace(
        fk_record.definition,
        source_schema || '.',
        format('%I.', target_schema)
      );

      execute format(
        'alter table %I.%I add constraint %I %s',
        target_schema,
        fk_record.table_name,
        fk_record.conname,
        remapped_fk
      );
    end if;
  end loop;

  for table_record in
    select table_name
    from information_schema.tables
    where table_schema = target_schema
      and table_type = 'BASE TABLE'
    order by table_name
  loop
    execute format('alter table %I.%I enable row level security', target_schema, table_record.table_name);
  end loop;

  execute format('grant usage on schema %I to service_role', target_schema);
  execute format('grant all privileges on all tables in schema %I to service_role', target_schema);
  execute format('grant all privileges on all routines in schema %I to service_role', target_schema);
  execute format('grant all privileges on all sequences in schema %I to service_role', target_schema);
  execute format('alter default privileges in schema %I grant all privileges on tables to service_role', target_schema);
  execute format('alter default privileges in schema %I grant all privileges on routines to service_role', target_schema);
  execute format('alter default privileges in schema %I grant all privileges on sequences to service_role', target_schema);
end $$;
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
  template_schema constant text := 'tenant_template';
  tenant_schema text := lower(trim(p_schema_name));
  normalized_slug text := lower(trim(p_slug));
  tenant_id uuid;
  location_id uuid;
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
notify pgrst, 'reload schema';
