-- Trigger helpers are internal implementation details; keep their privileges
-- and search paths explicit so they cannot be invoked through the Data API.

revoke all
on function control.configure_new_tenant_conversation_automation()
from public, anon, authenticated;

grant execute
on function control.configure_new_tenant_conversation_automation()
to service_role;

do $$
declare
  target_schema text;
begin
  for target_schema in
    select 'tenant_template'
    union
    select schema_name
    from control.tenants
    where schema_name like 'tenant_%'
  loop
    if to_regprocedure(format('%I.enforce_max_active_payment_accounts()', target_schema)) is not null then
      execute format(
        'alter function %I.enforce_max_active_payment_accounts()
           set search_path = pg_catalog, %I',
        target_schema,
        target_schema
      );

      execute format(
        'revoke all on function %I.enforce_max_active_payment_accounts()
           from public, anon, authenticated',
        target_schema
      );
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
