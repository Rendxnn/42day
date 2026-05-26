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
        and table_name = 'conversations'
    ) then
      execute format(
        'alter table %I.conversations
           add column if not exists context jsonb not null default ''{}''::jsonb,
           add column if not exists clarification_attempts integer not null default 0',
        tenant_schema
      );
    end if;

    if exists (
      select 1
      from information_schema.tables
      where table_schema = tenant_schema
        and table_name = 'draft_orders'
    ) then
      execute format(
        'alter table %I.draft_orders
           add column if not exists service_timing text not null default ''asap'',
           add column if not exists scheduled_for timestamptz',
        tenant_schema
      );

      execute format(
        'alter table %I.draft_orders
           drop constraint if exists draft_orders_service_timing_check',
        tenant_schema
      );

      execute format(
        'alter table %I.draft_orders
           add constraint draft_orders_service_timing_check
           check (service_timing in (''asap'', ''scheduled''))',
        tenant_schema
      );
    end if;

    if exists (
      select 1
      from information_schema.tables
      where table_schema = tenant_schema
        and table_name = 'orders'
    ) then
      execute format(
        'alter table %I.orders
           add column if not exists service_timing text not null default ''asap'',
           add column if not exists scheduled_for timestamptz,
           add column if not exists restaurant_confirmed_at timestamptz,
           add column if not exists payment_confirmed_at timestamptz',
        tenant_schema
      );

      execute format(
        'alter table %I.orders
           drop constraint if exists orders_service_timing_check',
        tenant_schema
      );

      execute format(
        'alter table %I.orders
           add constraint orders_service_timing_check
           check (service_timing in (''asap'', ''scheduled''))',
        tenant_schema
      );

      execute format(
        'create index if not exists %I on %I.orders (restaurant_confirmed_at)',
        tenant_schema || '_orders_restaurant_confirmed_at_idx',
        tenant_schema
      );

      execute format(
        'create index if not exists %I on %I.orders (payment_confirmed_at)',
        tenant_schema || '_orders_payment_confirmed_at_idx',
        tenant_schema
      );
    end if;

    if exists (
      select 1
      from information_schema.tables
      where table_schema = tenant_schema
        and table_name = 'human_intervention_alerts'
    ) then
      execute format(
        'create index if not exists %I on %I.human_intervention_alerts (type, status, created_at desc)',
        tenant_schema || '_alerts_type_status_created_idx',
        tenant_schema
      );
    end if;
  end loop;
end $$;
