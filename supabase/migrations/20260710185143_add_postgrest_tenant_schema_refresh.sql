create or replace function control.refresh_postgrest_tenant_schemas()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  schemas_csv text;
begin
  select string_agg(schema_name, ', ' order by sort_order, schema_name)
  into schemas_csv
  from (
    select 'public'::text as schema_name, 0 as sort_order
    union all
    select 'graphql_public'::text as schema_name, 1 as sort_order
    union all
    select 'control'::text as schema_name, 2 as sort_order
    union
    select t.schema_name, 10 as sort_order
    from control.tenants t
    where t.schema_name ~ '^tenant_[a-z0-9_]+$'
  ) schemas;

  execute format('alter role authenticator set pgrst.db_schemas = %L', schemas_csv);
  notify pgrst, 'reload config';
  notify pgrst, 'reload schema';

  return schemas_csv;
end;
$$;

revoke all on function control.refresh_postgrest_tenant_schemas() from public;
revoke all on function control.refresh_postgrest_tenant_schemas() from anon;
revoke all on function control.refresh_postgrest_tenant_schemas() from authenticated;
grant execute on function control.refresh_postgrest_tenant_schemas() to service_role;
