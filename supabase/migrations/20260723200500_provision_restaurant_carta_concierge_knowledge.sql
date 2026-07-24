-- control.provision_restaurant_tenant grants authenticated access broadly while
-- it is cloning the tenant template. Revoke it again at transaction end for
-- this private knowledge table, after the schema has been created.
create or replace function control.configure_new_tenant_carta_concierge_knowledge()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform control.configure_tenant_carta_concierge_knowledge(new.schema_name);
  return new;
end;
$$;

revoke all on function control.configure_new_tenant_carta_concierge_knowledge() from public, anon, authenticated;

drop trigger if exists configure_new_tenant_carta_concierge_knowledge on control.tenants;
create constraint trigger configure_new_tenant_carta_concierge_knowledge
after insert on control.tenants
deferrable initially deferred
for each row
execute function control.configure_new_tenant_carta_concierge_knowledge();

notify pgrst, 'reload schema';
