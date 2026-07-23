do $$
declare
  target_schema text;
  constraint_name text;
begin
  for target_schema in
    select 'tenant_template'
    union
    select schema_name
    from control.tenants
    where schema_name like 'tenant_%'
  loop
    if not exists (
      select 1
      from information_schema.tables
      where table_schema = target_schema
        and table_name = 'orders'
    ) then
      continue;
    end if;

    execute format(
      'alter table %I.orders
        add column if not exists kitchen_progress smallint not null default 0,
        add column if not exists kitchen_stage_label text,
        add column if not exists kitchen_progress_updated_at timestamptz,
        add column if not exists kitchen_progress_updated_by uuid',
      target_schema
    );

    constraint_name := target_schema || '_orders_kitchen_progress_check';
    if not exists (
      select 1
      from pg_constraint
      where conname = constraint_name
        and conrelid = format('%I.orders', target_schema)::regclass
    ) then
      execute format(
        'alter table %I.orders
          add constraint %I check (kitchen_progress in (0, 25, 50, 75, 100))',
        target_schema,
        constraint_name
      );
    end if;

    execute format(
      'create index if not exists %I
        on %I.orders (status, kitchen_progress, updated_at desc)
        where status in (''accepted'', ''preparing'')',
      target_schema || '_orders_kitchen_workflow_idx',
      target_schema
    );

    execute format(
      'comment on column %I.orders.kitchen_progress is
        ''Kitchen completion percentage constrained to operational milestones: 0, 25, 50, 75 or 100.''',
      target_schema
    );
    execute format(
      'comment on column %I.orders.kitchen_stage_label is
        ''Optional restaurant-defined label overriding the default label for the current kitchen milestone.''',
      target_schema
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
