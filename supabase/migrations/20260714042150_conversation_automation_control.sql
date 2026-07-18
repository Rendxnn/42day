do $$
declare
  target_schema text;
  tenant_record record;
begin
  for target_schema in
    select 'tenant_template'
    union
    select schema_name from control.tenants where schema_name like 'tenant_%'
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = target_schema and table_name = 'conversations'
    ) then
      execute format('alter table %I.conversations add column if not exists automation_enabled boolean not null default true', target_schema);
      execute format('alter table %I.conversations add column if not exists automation_resume_state text', target_schema);
      execute format('alter table %I.conversations add column if not exists automation_changed_at timestamptz', target_schema);
      execute format('alter table %I.conversations add column if not exists automation_changed_by uuid', target_schema);
      execute format('alter table %I.conversations add column if not exists automation_change_reason text', target_schema);
      execute format('update %I.conversations set automation_enabled = false, automation_resume_state = coalesce(automation_resume_state, ''awaiting_mode_selection''), automation_change_reason = coalesce(automation_change_reason, manual_reason, ''legacy_manual'') where state = ''manual''', target_schema);
      execute format('create index if not exists conversations_automation_enabled_updated_at_idx on %I.conversations (automation_enabled, updated_at desc)', target_schema);
    end if;
  end loop;

  for tenant_record in select id, schema_name from control.tenants where schema_name like 'tenant_%' loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = tenant_record.schema_name and table_name = 'human_intervention_alerts'
    ) then
      execute format('drop policy if exists "tenant members can read realtime human intervention alerts" on %I.human_intervention_alerts', tenant_record.schema_name);
      execute format(
        'create policy "tenant members can read realtime human intervention alerts" on %I.human_intervention_alerts for select to authenticated using (exists (select 1 from control.tenant_users tu where tu.tenant_id = %L::uuid and tu.user_id = (select auth.uid()) and tu.status = ''active''))',
        tenant_record.schema_name,
        tenant_record.id
      );
      if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
        and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = tenant_record.schema_name and tablename = 'human_intervention_alerts') then
        execute format('alter publication supabase_realtime add table %I.human_intervention_alerts', tenant_record.schema_name);
      end if;
    end if;
  end loop;
end;
$$;
notify pgrst, 'reload schema';
