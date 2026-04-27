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
        and table_name = 'product_options'
    ) then
      execute format(
        'alter table %I.product_options
           add column if not exists code text,
           add column if not exists description text,
           add column if not exists aliases jsonb not null default ''[]''::jsonb,
           add column if not exists sort_order integer not null default 0,
           add column if not exists display_mode text not null default ''list''',
        tenant_schema
      );

      execute format(
        'alter table %I.product_options
           drop constraint if exists product_options_display_mode_check',
        tenant_schema
      );

      execute format(
        'alter table %I.product_options
           add constraint product_options_display_mode_check
           check (display_mode in (''list'', ''buttons'', ''swatches'', ''text''))',
        tenant_schema
      );

      execute format(
        'create index if not exists %I on %I.product_options (product_id, sort_order)',
        tenant_schema || '_product_options_product_sort_idx',
        tenant_schema
      );
    end if;

    if exists (
      select 1
      from information_schema.tables
      where table_schema = tenant_schema
        and table_name = 'product_option_values'
    ) then
      execute format(
        'alter table %I.product_option_values
           add column if not exists code text,
           add column if not exists description text,
           add column if not exists aliases jsonb not null default ''[]''::jsonb,
           add column if not exists sort_order integer not null default 0',
        tenant_schema
      );

      execute format(
        'create index if not exists %I on %I.product_option_values (option_id, sort_order)',
        tenant_schema || '_product_option_values_option_sort_idx',
        tenant_schema
      );
    end if;
  end loop;
end $$;
