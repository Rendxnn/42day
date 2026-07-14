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
      execute format('alter table %I.locations add column if not exists try_geocode_written_addresses boolean not null default true', target_schema);
      execute format('alter table %I.locations alter column try_geocode_written_addresses set default true', target_schema);
      execute format('update %I.locations set try_geocode_written_addresses = true where try_geocode_written_addresses is false', target_schema);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
