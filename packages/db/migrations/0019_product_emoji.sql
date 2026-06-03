do $$
declare
  tenant record;
begin
  for tenant in
    select schema_name
    from control.tenants
    where to_regclass(format('%I.products', schema_name)) is not null
  loop
    execute format('alter table %I.products add column if not exists emoji text', tenant.schema_name);
  end loop;
end $$;
