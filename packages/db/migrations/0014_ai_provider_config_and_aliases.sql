create table if not exists control.tenant_ai_provider_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references control.tenants(id),
  provider_id text not null check (provider_id in ('gemini', 'openai', 'openrouter', 'anthropic', 'custom')),
  auth_mode text not null default 'api_key' check (auth_mode in ('api_key', 'oauth', 'custom')),
  encrypted_api_key text,
  encrypted_access_token text,
  default_model text,
  provider_extra jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_id)
);

create index if not exists tenant_ai_provider_configs_tenant_status_idx
  on control.tenant_ai_provider_configs (tenant_id, status);

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
        and table_name = 'products'
    ) then
      execute format(
        'alter table %I.products
           add column if not exists aliases jsonb not null default ''[]''::jsonb',
        tenant_schema
      );
    end if;

    if exists (
      select 1
      from information_schema.tables
      where table_schema = tenant_schema
        and table_name = 'menu_items'
    ) then
      execute format(
        'alter table %I.menu_items
           add column if not exists aliases jsonb not null default ''[]''::jsonb',
        tenant_schema
      );
    end if;
  end loop;
end $$;
