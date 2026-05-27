do $$
declare
  tenant_schema text;
begin
  for tenant_schema in
    select distinct schema_name
    from control.tenants
    where schema_name like 'tenant_%'
  loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = tenant_schema
        and table_name = 'orders'
    ) then
      execute format(
        'alter table %I.orders
           add column if not exists restaurant_reviewed_at timestamptz,
           add column if not exists restaurant_reviewed_by uuid,
           add column if not exists restaurant_confirmed_by uuid,
           add column if not exists restaurant_review_note text,
           add column if not exists restaurant_review_metadata jsonb not null default ''{}''::jsonb,
           add column if not exists customer_notified_at timestamptz,
           add column if not exists customer_notification_status text not null default ''pending'',
           add column if not exists customer_notification_error text',
        tenant_schema
      );

      execute format(
        'alter table %I.orders
           drop constraint if exists orders_customer_notification_status_check',
        tenant_schema
      );

      execute format(
        'alter table %I.orders
           add constraint orders_customer_notification_status_check
           check (customer_notification_status in (''pending'', ''sent'', ''failed''))',
        tenant_schema
      );

      execute format(
        'create index if not exists %I on %I.orders (customer_notification_status)',
        tenant_schema || '_orders_customer_notification_status_idx',
        tenant_schema
      );

      execute format(
        'create index if not exists %I on %I.orders (restaurant_reviewed_at)',
        tenant_schema || '_orders_restaurant_reviewed_at_idx',
        tenant_schema
      );
    end if;

    if exists (
      select 1
      from information_schema.tables
      where table_schema = tenant_schema
        and table_name = 'order_items'
    ) then
      execute format(
        'alter table %I.order_items
           add column if not exists menu_item_id uuid references %I.menu_items(id),
           add column if not exists category_snapshot text',
        tenant_schema,
        tenant_schema
      );

      execute format(
        'create index if not exists %I on %I.order_items (menu_item_id)',
        tenant_schema || '_order_items_menu_item_id_idx',
        tenant_schema
      );
    end if;
  end loop;
end $$;
