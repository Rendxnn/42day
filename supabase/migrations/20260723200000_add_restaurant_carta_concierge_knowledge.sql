-- Canonical JSON knowledge for the public digital-menu concierge.  This is
-- tenant-local on purpose: it must never be shared with another restaurant or
-- with the WhatsApp ordering automation.
create or replace function control.configure_tenant_carta_concierge_knowledge(p_schema_name text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_schema_name !~ '^tenant_[a-z0-9_]{2,56}$' then
    raise exception 'invalid_tenant_schema';
  end if;

  execute format($table$
    create table if not exists %I.restaurant_knowledge_bases (
      id uuid primary key default gen_random_uuid(),
      singleton_key text not null default 'restaurant',
      document jsonb not null default '{"version":1}'::jsonb,
      source_file_name text,
      version integer not null default 1 check (version > 0),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint restaurant_knowledge_bases_singleton_key unique (singleton_key),
      constraint restaurant_knowledge_bases_document_object check (jsonb_typeof(document) = 'object')
    )
  $table$, p_schema_name);

  execute format('alter table %I.restaurant_knowledge_bases enable row level security', p_schema_name);
  execute format('revoke all on table %I.restaurant_knowledge_bases from public, anon, authenticated', p_schema_name);
  execute format('grant all privileges on table %I.restaurant_knowledge_bases to service_role', p_schema_name);
end;
$$;

revoke all on function control.configure_tenant_carta_concierge_knowledge(text) from public, anon, authenticated;
grant execute on function control.configure_tenant_carta_concierge_knowledge(text) to service_role;

do $$
declare
  tenant_record record;
begin
  perform control.configure_tenant_carta_concierge_knowledge('tenant_template');

  for tenant_record in
    select schema_name
    from control.tenants
    where schema_name like 'tenant_%'
  loop
    perform control.configure_tenant_carta_concierge_knowledge(tenant_record.schema_name);
  end loop;
end;
$$;

-- New tenant schemas are cloned from tenant_template by
-- control.provision_restaurant_tenant, so this table and its RLS posture are
-- included automatically for every subsequently created restaurant.
notify pgrst, 'reload schema';
