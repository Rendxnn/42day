-- Menu items can be referenced by past orders, so deleting them physically is
-- unsafe. A tombstone separates a deliberate removal from a temporary pause.

do $$
declare
  tenant_record record;
begin
  for tenant_record in
    select 'tenant_template'::text as schema_name
    union
    select schema_name from control.tenants where schema_name like 'tenant_%'
  loop
    if to_regclass(format('%I.menu_items', tenant_record.schema_name)) is not null then
      execute format(
        'alter table %I.menu_items add column if not exists removed_at timestamptz',
        tenant_record.schema_name
      );

      -- Products that were already removed from the catalogue are retired from
      -- the menu too, while their past order references remain intact.
      if to_regclass(format('%I.products', tenant_record.schema_name)) is not null then
        execute format(
          'update %1$I.menu_items mi
             set is_available = false,
                 removed_at = coalesce(mi.removed_at, now())
            from %1$I.products p
           where mi.product_id = p.id
             and p.is_active is not true',
          tenant_record.schema_name
        );
      end if;
    end if;
  end loop;
end;
$$;

create or replace function control.prune_inactive_product_menu_items()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if old.is_active is distinct from new.is_active and new.is_active is false then
    execute format(
      'update %I.menu_items
          set is_available = false,
              removed_at = coalesce(removed_at, now())
        where product_id = $1',
      tg_table_schema
    ) using new.id;
  end if;

  return new;
end;
$$;

revoke all on function control.prune_inactive_product_menu_items() from public, anon, authenticated;

notify pgrst, 'reload schema';
