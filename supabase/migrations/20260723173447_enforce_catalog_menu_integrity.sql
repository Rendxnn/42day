-- A product that leaves the catalogue must not remain orderable from a menu.
-- Products are soft-deleted (is_active = false). Menu rows referenced by past
-- orders cannot be hard-deleted because they are part of the order audit, so
-- the cleanup makes them unavailable immediately instead.

create or replace function control.prune_inactive_product_menu_items()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if old.is_active is distinct from new.is_active and new.is_active is false then
    execute format('update %I.menu_items set is_available = false where product_id = $1', tg_table_schema)
      using new.id;
  end if;

  return new;
end;
$$;

revoke all on function control.prune_inactive_product_menu_items() from public, anon, authenticated;

create or replace function control.require_active_catalog_product_for_menu_item()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  product_is_active boolean;
begin
  -- Combo menu items are governed by their own catalogue relation.
  if new.product_id is null then
    return new;
  end if;

  execute format(
    'select exists (select 1 from %I.products where id = $1 and is_active is true)',
    tg_table_schema
  )
  into product_is_active
  using new.product_id;

  if not product_is_active then
    raise exception 'menu_item_product_must_be_active'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function control.require_active_catalog_product_for_menu_item() from public, anon, authenticated;

create or replace function control.configure_tenant_catalog_menu_integrity(p_schema_name text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_schema_name !~ '^tenant_[a-z0-9_]{2,56}$' then
    raise exception 'invalid_tenant_schema';
  end if;

  if to_regclass(format('%I.products', p_schema_name)) is null
    or to_regclass(format('%I.menu_items', p_schema_name)) is null then
    return;
  end if;

  execute format('drop trigger if exists prune_menu_items_for_inactive_product on %I.products', p_schema_name);
  execute format(
    'create trigger prune_menu_items_for_inactive_product
       after update of is_active on %I.products
       for each row
       when (old.is_active is distinct from new.is_active and new.is_active is false)
       execute function control.prune_inactive_product_menu_items()',
    p_schema_name
  );

  execute format('drop trigger if exists require_active_catalog_product_for_menu_item on %I.menu_items', p_schema_name);
  execute format(
    'create trigger require_active_catalog_product_for_menu_item
       before insert or update of product_id on %I.menu_items
       for each row
       execute function control.require_active_catalog_product_for_menu_item()',
    p_schema_name
  );

  -- Repair existing rows left by soft deletions before this constraint existed.
  -- Keep rows referenced by historical orders for traceability, but never let
  -- them remain in an available menu.
  execute format(
    'update %1$I.menu_items mi
        set is_available = false
      from %1$I.products p
      where mi.product_id = p.id
        and p.is_active is not true',
    p_schema_name
  );
end;
$$;

revoke all on function control.configure_tenant_catalog_menu_integrity(text) from public, anon, authenticated;
grant execute on function control.configure_tenant_catalog_menu_integrity(text) to service_role;

do $$
declare
  tenant_record record;
begin
  perform control.configure_tenant_catalog_menu_integrity('tenant_template');

  for tenant_record in
    select schema_name
    from control.tenants
    where schema_name like 'tenant_%'
  loop
    perform control.configure_tenant_catalog_menu_integrity(tenant_record.schema_name);
  end loop;
end;
$$;

create or replace function control.configure_new_tenant_catalog_menu_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform control.configure_tenant_catalog_menu_integrity(new.schema_name);
  return new;
end;
$$;

revoke all on function control.configure_new_tenant_catalog_menu_integrity() from public, anon, authenticated;

drop trigger if exists configure_new_tenant_catalog_menu_integrity on control.tenants;
create constraint trigger configure_new_tenant_catalog_menu_integrity
after insert on control.tenants
deferrable initially deferred
for each row
execute function control.configure_new_tenant_catalog_menu_integrity();

notify pgrst, 'reload schema';
