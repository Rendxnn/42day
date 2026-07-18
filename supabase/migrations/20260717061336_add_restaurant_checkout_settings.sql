do $$
declare
  target_schema text;
begin
  for target_schema in
    select 'tenant_template'
    union
    select schema_name from control.tenants where schema_name like 'tenant_%'
  loop
    if exists (select 1 from information_schema.tables where table_schema = target_schema and table_name = 'locations') then
      execute format('alter table %I.locations add column if not exists electronic_billing_enabled boolean not null default true', target_schema);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';;
