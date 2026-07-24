-- Categories are a restaurant-owned catalogue concept.  Store their presentation
-- emoji once per tenant instead of deriving a generic icon on every channel.
create or replace function control.normalize_product_category_name(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select trim(both '-' from regexp_replace(
    translate(lower(trim(coalesce(p_value, ''))), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun'),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
$$;

revoke all on function control.normalize_product_category_name(text) from public, anon, authenticated;

create or replace function control.default_product_category_emoji(p_category_name text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  category_key text := control.normalize_product_category_name(p_category_name);
begin
  if category_key like '%hamburg%' then return '🍔'; end if;
  if category_key like '%picad%' then return '🥩'; end if;
  if category_key like '%entrada%' or category_key like '%aperitivo%' then return '🥟'; end if;
  if category_key like '%desayun%' then return '🍳'; end if;
  if category_key like '%almuerz%' then return '🍲'; end if;
  if category_key like '%plato%fuerte%' or category_key like '%principal%' then return '🍛'; end if;
  if category_key like '%pizza%' then return '🍕'; end if;
  if category_key like '%sandwich%' or category_key like '%sanduche%' then return '🥪'; end if;
  if category_key like '%bebida%' or category_key like '%jugo%' or category_key like '%limonada%' or category_key like '%soda%' then return '🥤'; end if;
  if category_key like '%cerveza%' or category_key like '%licor%' or category_key like '%coctel%' then return '🍺'; end if;
  if category_key like '%postre%' or category_key like '%dulce%' then return '🍰'; end if;
  if category_key like '%adicion%' or category_key like '%acompan%' or category_key like '%papas%' then return '🍟'; end if;
  if category_key like '%ensalada%' then return '🥗'; end if;
  return '🍽️';
end;
$$;

revoke all on function control.default_product_category_emoji(text) from public, anon, authenticated;

create or replace function control.sync_product_category()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  category_name text := nullif(trim(new.category), '');
  category_key text;
begin
  if category_name is null then
    return new;
  end if;

  category_key := control.normalize_product_category_name(category_name);
  if category_key = '' then
    return new;
  end if;

  execute format(
    'insert into %I.product_categories (name, normalized_name, emoji)
     values ($1, $2, $3)
     on conflict (normalized_name) do nothing',
    tg_table_schema
  ) using category_name, category_key, control.default_product_category_emoji(category_name);

  return new;
end;
$$;

revoke all on function control.sync_product_category() from public, anon, authenticated;

create or replace function control.configure_tenant_product_categories(p_schema_name text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_schema_name !~ '^tenant_[a-z0-9_]{2,56}$' then
    raise exception 'invalid_tenant_schema';
  end if;

  if to_regclass(format('%I.products', p_schema_name)) is null then
    return;
  end if;

  execute format($table$
    create table if not exists %I.product_categories (
      id uuid primary key default gen_random_uuid(),
      name text not null check (length(trim(name)) between 1 and 80),
      normalized_name text not null check (length(trim(normalized_name)) between 1 and 80),
      emoji text not null default '🍽️' check (length(trim(emoji)) between 1 and 16),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint product_categories_normalized_name_key unique (normalized_name)
    )
  $table$, p_schema_name);

  execute format('alter table %I.product_categories enable row level security', p_schema_name);
  execute format('revoke all on table %I.product_categories from public, anon, authenticated', p_schema_name);
  execute format('grant all privileges on table %I.product_categories to service_role', p_schema_name);

  execute format(
    'insert into %1$I.product_categories (name, normalized_name, emoji)
     select distinct on (control.normalize_product_category_name(category))
       trim(category),
       control.normalize_product_category_name(category),
       control.default_product_category_emoji(category)
     from %1$I.products
     where nullif(trim(category), '''') is not null
     order by control.normalize_product_category_name(category), category
     on conflict (normalized_name) do nothing',
    p_schema_name
  );

  execute format('drop trigger if exists sync_product_category_after_write on %I.products', p_schema_name);
  execute format(
    'create trigger sync_product_category_after_write
       after insert or update of category on %I.products
       for each row
       execute function control.sync_product_category()',
    p_schema_name
  );
end;
$$;

revoke all on function control.configure_tenant_product_categories(text) from public, anon, authenticated;
grant execute on function control.configure_tenant_product_categories(text) to service_role;

do $$
declare
  tenant_record record;
begin
  perform control.configure_tenant_product_categories('tenant_template');

  for tenant_record in
    select schema_name
    from control.tenants
    where schema_name like 'tenant_%'
  loop
    perform control.configure_tenant_product_categories(tenant_record.schema_name);
  end loop;
end;
$$;

-- Provisioning clones the template and grants broad access to its objects.
-- Re-apply the private access posture after a new tenant is committed.
create or replace function control.configure_new_tenant_product_categories()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform control.configure_tenant_product_categories(new.schema_name);
  return new;
end;
$$;

revoke all on function control.configure_new_tenant_product_categories() from public, anon, authenticated;

drop trigger if exists configure_new_tenant_product_categories on control.tenants;
create constraint trigger configure_new_tenant_product_categories
after insert on control.tenants
deferrable initially deferred
for each row
execute function control.configure_new_tenant_product_categories();

notify pgrst, 'reload schema';
