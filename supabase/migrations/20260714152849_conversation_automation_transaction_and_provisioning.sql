create or replace function control.configure_tenant_conversation_automation(
  p_schema_name text,
  p_tenant_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = p_schema_name and table_name = 'conversations'
  ) then
    return;
  end if;

  execute format('alter table %I.conversations add column if not exists automation_enabled boolean not null default true', p_schema_name);
  execute format('alter table %I.conversations add column if not exists automation_resume_state text', p_schema_name);
  execute format('alter table %I.conversations add column if not exists automation_changed_at timestamptz', p_schema_name);
  execute format('alter table %I.conversations add column if not exists automation_changed_by uuid', p_schema_name);
  execute format('alter table %I.conversations add column if not exists automation_change_reason text', p_schema_name);
  execute format('create index if not exists conversations_automation_enabled_updated_at_idx on %I.conversations (automation_enabled, updated_at desc)', p_schema_name);

  execute format($function$
    create or replace function %1$I.change_conversation_automation(
      p_conversation_id uuid,
      p_enabled boolean,
      p_expected_updated_at timestamptz,
      p_changed_by uuid
    ) returns jsonb
    language plpgsql
    security invoker
    set search_path = %1$I, pg_catalog
    as $rpc$
    declare
      current_conversation %1$I.conversations%%rowtype;
      next_state text;
      next_resume_state text;
      was_paused boolean;
      changed_at timestamptz := now();
    begin
      select * into current_conversation
      from %1$I.conversations
      where id = p_conversation_id
      for update;

      if not found then
        raise exception 'conversation_not_found';
      end if;
      if current_conversation.state in ('completed', 'expired') then
        raise exception 'conversation_terminal';
      end if;
      if current_conversation.updated_at <> p_expected_updated_at then
        raise exception 'conversation_stale';
      end if;

      was_paused := current_conversation.automation_enabled = false;
      next_resume_state := coalesce(current_conversation.automation_resume_state, current_conversation.state, 'awaiting_mode_selection');
      next_state := case when p_enabled then
        case when current_conversation.state = 'manual' then next_resume_state else current_conversation.state end
        else 'manual'
      end;

      update %1$I.conversations
      set state = next_state,
          manual_reason = case when p_enabled then null else 'restaurant_paused' end,
          automation_enabled = p_enabled,
          automation_resume_state = case when p_enabled then null else next_resume_state end,
          automation_changed_at = changed_at,
          automation_changed_by = p_changed_by,
          automation_change_reason = case when p_enabled then 'restaurant_resumed' else 'restaurant_paused' end,
          clarification_attempts = case when p_enabled and was_paused then 0 else clarification_attempts end,
          updated_at = changed_at
      where id = p_conversation_id
      returning * into current_conversation;

      if p_enabled and was_paused then
        update %1$I.human_intervention_alerts
        set status = 'resolved', resolved_at = changed_at
        where conversation_id = p_conversation_id
          and status in ('open', 'acknowledged')
          and type in ('support_requested', 'parser_failed', 'validation_failed_repeatedly', 'technical_error', 'order_change_requested');
      end if;

      insert into %1$I.app_events (conversation_id, event_name, severity, source, metadata)
      values (
        p_conversation_id,
        case when p_enabled then 'conversation.automation_resumed' else 'conversation.automation_paused' end,
        'info',
        'dashboard',
        jsonb_build_object('actorId', p_changed_by, 'automationEnabled', p_enabled)
      );

      return to_jsonb(current_conversation);
    end;
    $rpc$;
  $function$, p_schema_name);
  execute format('revoke all on function %I.change_conversation_automation(uuid, boolean, timestamptz, uuid) from public, anon, authenticated', p_schema_name);
  execute format('grant execute on function %I.change_conversation_automation(uuid, boolean, timestamptz, uuid) to service_role', p_schema_name);

  if p_tenant_id is not null and exists (
    select 1 from information_schema.tables
    where table_schema = p_schema_name and table_name = 'human_intervention_alerts'
  ) then
    execute format('alter table %I.human_intervention_alerts enable row level security', p_schema_name);
    execute format('drop policy if exists "tenant members can read realtime human intervention alerts" on %I.human_intervention_alerts', p_schema_name);
    execute format(
      'create policy "tenant members can read realtime human intervention alerts" on %I.human_intervention_alerts for select to authenticated using (exists (select 1 from control.tenant_users tu where tu.tenant_id = %L::uuid and tu.user_id = (select auth.uid()) and tu.status = ''active''))',
      p_schema_name,
      p_tenant_id
    );
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
      and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = p_schema_name and tablename = 'human_intervention_alerts') then
      execute format('alter publication supabase_realtime add table %I.human_intervention_alerts', p_schema_name);
    end if;
  end if;
end;
$$;
revoke all on function control.configure_tenant_conversation_automation(text, uuid) from public, anon, authenticated;
grant execute on function control.configure_tenant_conversation_automation(text, uuid) to service_role;
do $$
declare
  tenant_record record;
begin
  perform control.configure_tenant_conversation_automation('tenant_template', null);
  for tenant_record in select id, schema_name from control.tenants where schema_name like 'tenant_%' loop
    perform control.configure_tenant_conversation_automation(tenant_record.schema_name, tenant_record.id);
  end loop;
end;
$$;
create or replace function control.configure_new_tenant_conversation_automation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform control.configure_tenant_conversation_automation(new.schema_name, new.id);
  return new;
end;
$$;
drop trigger if exists configure_new_tenant_conversation_automation on control.tenants;
create constraint trigger configure_new_tenant_conversation_automation
after insert on control.tenants
deferrable initially deferred
for each row execute function control.configure_new_tenant_conversation_automation();
notify pgrst, 'reload schema';
