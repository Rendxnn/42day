do $$
declare
  tenant record;
begin
  for tenant in
    select id, schema_name
    from control.tenants
    where status = 'active'
      and to_regclass(format('%I.orders', schema_name)) is not null
  loop
    execute format('alter table %I.orders enable row level security', tenant.schema_name);

    execute format('drop policy if exists "tenant members can read realtime orders" on %I.orders', tenant.schema_name);
    execute format(
      'create policy "tenant members can read realtime orders" on %I.orders for select to authenticated using (exists (select 1 from control.tenant_users tu where tu.tenant_id = %L::uuid and tu.user_id = (select auth.uid()) and tu.status = ''active''))',
      tenant.schema_name,
      tenant.id
    );

    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = tenant.schema_name
          and tablename = 'orders'
      ) then
      execute format('alter publication supabase_realtime add table %I.orders', tenant.schema_name);
    end if;
  end loop;
end $$;
