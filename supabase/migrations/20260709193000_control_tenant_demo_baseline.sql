


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "control";


ALTER SCHEMA "control" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "tenant_demo";


ALTER SCHEMA "tenant_demo" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "control"."get_tenant_admin_snapshot"("p_schema_name" "text", "p_timezone" "text" DEFAULT 'America/Bogota'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  tenant_schema text := lower(trim(p_schema_name));
  business_date date := ((now() at time zone coalesce(nullif(trim(p_timezone), ''), 'America/Bogota'))::date);
  location_payload jsonb := null;
  active_product_count integer := 0;
  today_menu_item_count integer := 0;
  orders_today_count integer := 0;
  pending_order_count integer := 0;
  completed_today_count integer := 0;
  revenue_today integer := 0;
  last_order_at timestamptz := null;
begin
  if tenant_schema !~ '^tenant_[a-z0-9_]{2,56}$' then
    raise exception 'invalid_tenant_schema';
  end if;

  if to_regclass(format('%I.locations', tenant_schema)) is not null then
    execute format('select to_jsonb(l) from %I.locations l order by l.created_at asc limit 1', tenant_schema)
    into location_payload;
  end if;

  if to_regclass(format('%I.products', tenant_schema)) is not null then
    execute format('select count(*)::integer from %I.products where is_active = true', tenant_schema)
    into active_product_count;
  end if;

  if to_regclass(format('%I.menu_items', tenant_schema)) is not null
    and to_regclass(format('%I.menus', tenant_schema)) is not null
    and to_regclass(format('%I.locations', tenant_schema)) is not null
  then
    execute format(
      'select count(mi.id)::integer
       from %I.menu_items mi
       join %I.menus m on m.id = mi.menu_id
       join %I.locations l on l.id = m.location_id
       where m.date = $1
         and m.status = ''published''
         and mi.is_available = true
         and l.is_active = true',
      tenant_schema,
      tenant_schema,
      tenant_schema
    )
    into today_menu_item_count
    using business_date;
  end if;

  if to_regclass(format('%I.orders', tenant_schema)) is not null then
    execute format(
      'select
         count(*)::integer,
         count(*) filter (where status in (''new'', ''pending_restaurant_confirmation'', ''needs_customer_replacement''))::integer,
         count(*) filter (where status = ''delivered'')::integer,
         coalesce(sum(total) filter (where status <> ''cancelled''), 0)::integer
       from %I.orders
       where created_at >= $1::date
         and created_at < ($1::date + interval ''1 day'')',
      tenant_schema
    )
    into orders_today_count, pending_order_count, completed_today_count, revenue_today
    using business_date;

    execute format('select max(created_at) from %I.orders', tenant_schema)
    into last_order_at;
  end if;

  return jsonb_build_object(
    'location', location_payload,
    'metrics', jsonb_build_object(
      'activeProductCount', active_product_count,
      'todayMenuItemCount', today_menu_item_count,
      'ordersTodayCount', orders_today_count,
      'pendingOrderCount', pending_order_count,
      'completedTodayCount', completed_today_count,
      'revenueToday', revenue_today,
      'lastOrderAt', last_order_at
    )
  );
end;
$_$;


ALTER FUNCTION "control"."get_tenant_admin_snapshot"("p_schema_name" "text", "p_timezone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "control"."provision_restaurant_tenant"("p_name" "text", "p_slug" "text", "p_schema_name" "text", "p_timezone" "text" DEFAULT 'America/Bogota'::"text", "p_currency" "text" DEFAULT 'COP'::"text", "p_status" "text" DEFAULT 'active'::"text", "p_automation_enabled" boolean DEFAULT true, "p_location_name" "text" DEFAULT 'Sede principal'::"text", "p_location_address" "text" DEFAULT NULL::"text", "p_location_phone" "text" DEFAULT NULL::"text", "p_delivery_fee_fixed" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "schema_name" "text", "status" "text", "timezone" "text", "currency" "text", "automation_enabled" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  template_schema constant text := 'tenant_demo';
  tenant_schema text := lower(trim(p_schema_name));
  normalized_slug text := lower(trim(p_slug));
  tenant_id uuid;
  location_id uuid;
  schemas_csv text;
  table_record record;
  fk_record record;
  remapped_fk text;
begin
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'restaurant_name_required';
  end if;

  if normalized_slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then
    raise exception 'invalid_restaurant_slug';
  end if;

  if tenant_schema !~ '^tenant_[a-z0-9_]{2,56}$' then
    raise exception 'invalid_tenant_schema';
  end if;

  if p_status not in ('active', 'inactive', 'suspended') then
    raise exception 'invalid_tenant_status';
  end if;

  if not exists (select 1 from pg_namespace where nspname = template_schema) then
    raise exception 'template_schema_missing';
  end if;

  if exists (
    select 1
    from control.tenants t
    where t.slug = normalized_slug
       or t.schema_name = tenant_schema
  ) then
    raise exception 'restaurant_slug_or_schema_exists';
  end if;

  if exists (select 1 from pg_namespace where nspname = tenant_schema) then
    raise exception 'tenant_schema_already_exists';
  end if;

  insert into control.tenants (
    name,
    slug,
    schema_name,
    status,
    timezone,
    currency,
    automation_enabled
  )
  values (
    trim(p_name),
    normalized_slug,
    tenant_schema,
    p_status,
    coalesce(nullif(trim(p_timezone), ''), 'America/Bogota'),
    coalesce(nullif(trim(p_currency), ''), 'COP'),
    coalesce(p_automation_enabled, true)
  )
  returning control.tenants.id into tenant_id;

  execute format('create schema %I', tenant_schema);

  for table_record in
    select table_name
    from information_schema.tables
    where table_schema = template_schema
      and table_type = 'BASE TABLE'
    order by table_name
  loop
    execute format(
      'create table %I.%I (like %I.%I including all)',
      tenant_schema,
      table_record.table_name,
      template_schema,
      table_record.table_name
    );
  end loop;

  for fk_record in
    select
      c.conname,
      rel.relname as table_name,
      pg_get_constraintdef(c.oid) as definition
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where c.contype = 'f'
      and nsp.nspname = template_schema
    order by rel.relname, c.conname
  loop
    if not exists (
      select 1
      from pg_constraint existing
      join pg_class existing_rel on existing_rel.oid = existing.conrelid
      join pg_namespace existing_nsp on existing_nsp.oid = existing_rel.relnamespace
      where existing.conname = fk_record.conname
        and existing_rel.relname = fk_record.table_name
        and existing_nsp.nspname = tenant_schema
    ) then
      remapped_fk := replace(
        fk_record.definition,
        template_schema || '.',
        format('%I.', tenant_schema)
      );

      execute format(
        'alter table %I.%I add constraint %I %s',
        tenant_schema,
        fk_record.table_name,
        fk_record.conname,
        remapped_fk
      );
    end if;
  end loop;

  for table_record in
    select table_name
    from information_schema.tables
    where table_schema = tenant_schema
      and table_type = 'BASE TABLE'
    order by table_name
  loop
    execute format('alter table %I.%I enable row level security', tenant_schema, table_record.table_name);
  end loop;

  execute format('grant usage on schema %I to service_role, authenticated', tenant_schema);
  execute format('grant all privileges on all tables in schema %I to service_role', tenant_schema);
  execute format('grant all privileges on all routines in schema %I to service_role', tenant_schema);
  execute format('grant all privileges on all sequences in schema %I to service_role', tenant_schema);
  execute format('grant select on all tables in schema %I to authenticated', tenant_schema);
  execute format('alter default privileges in schema %I grant all privileges on tables to service_role', tenant_schema);
  execute format('alter default privileges in schema %I grant all privileges on routines to service_role', tenant_schema);
  execute format('alter default privileges in schema %I grant all privileges on sequences to service_role', tenant_schema);

  if exists (
    select 1
    from information_schema.tables
    where table_schema = tenant_schema
      and table_name = 'orders'
  ) then
    execute format('drop policy if exists "tenant members can read realtime orders" on %I.orders', tenant_schema);
    execute format(
      'create policy "tenant members can read realtime orders" on %I.orders
         for select
         to authenticated
         using (
           exists (
             select 1
             from control.tenant_users tu
             where tu.tenant_id = %L::uuid
               and tu.user_id = (select auth.uid())
               and tu.status = ''active''
           )
         )',
      tenant_schema,
      tenant_id
    );

    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = tenant_schema
          and tablename = 'orders'
      )
    then
      execute format('alter publication supabase_realtime add table %I.orders', tenant_schema);
    end if;
  end if;

  execute format(
    'insert into %I.locations (
       name,
       address,
       phone,
       delivery_fee_fixed,
       pickup_enabled,
       delivery_enabled,
       automation_enabled,
       is_active
     )
     values (%L, %L, %L, %s, true, true, %L, true)
     returning id',
    tenant_schema,
    coalesce(nullif(trim(p_location_name), ''), 'Sede principal'),
    nullif(trim(coalesce(p_location_address, '')), ''),
    nullif(trim(coalesce(p_location_phone, '')), ''),
    greatest(coalesce(p_delivery_fee_fixed, 0), 0),
    coalesce(p_automation_enabled, true)
  )
  into location_id;

  execute format(
    'insert into %I.menus (location_id, date, name, status, published_at)
     values (%L::uuid, current_date, ''Menu de hoy'', ''published'', now())
     on conflict (location_id, date) do nothing',
    tenant_schema,
    location_id
  );

  notify pgrst, 'reload schema';

  return query
  select
    t.id,
    t.name,
    t.slug,
    t.schema_name,
    t.status,
    t.timezone,
    t.currency,
    t.automation_enabled
  from control.tenants t
  where t.id = tenant_id;
end;
$_$;


ALTER FUNCTION "control"."provision_restaurant_tenant"("p_name" "text", "p_slug" "text", "p_schema_name" "text", "p_timezone" "text", "p_currency" "text", "p_status" "text", "p_automation_enabled" boolean, "p_location_name" "text", "p_location_address" "text", "p_location_phone" "text", "p_delivery_fee_fixed" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "control"."update_tenant_primary_location"("p_schema_name" "text", "p_name" "text" DEFAULT NULL::"text", "p_address" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_delivery_fee_fixed" integer DEFAULT NULL::integer, "p_pickup_enabled" boolean DEFAULT NULL::boolean, "p_delivery_enabled" boolean DEFAULT NULL::boolean, "p_automation_enabled" boolean DEFAULT NULL::boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  tenant_schema text := lower(trim(p_schema_name));
  location_id uuid;
  location_payload jsonb;
begin
  if tenant_schema !~ '^tenant_[a-z0-9_]{2,56}$' then
    raise exception 'invalid_tenant_schema';
  end if;

  if to_regclass(format('%I.locations', tenant_schema)) is null then
    raise exception 'tenant_locations_missing';
  end if;

  execute format(
    'select id
     from %I.locations
     order by created_at asc
     limit 1',
    tenant_schema
  )
  into location_id;

  if location_id is null then
    execute format(
      'insert into %I.locations (
         name,
         address,
         phone,
         delivery_fee_fixed,
         pickup_enabled,
         delivery_enabled,
         automation_enabled,
         is_active
       )
       values (
         coalesce(nullif($1, ''''), ''Sede principal''),
         nullif($2, ''''),
         nullif($3, ''''),
         coalesce($4, 0),
         coalesce($5, true),
         coalesce($6, true),
         coalesce($7, true),
         true
       )
       returning id',
      tenant_schema
    )
    into location_id
    using p_name, p_address, p_phone, p_delivery_fee_fixed, p_pickup_enabled, p_delivery_enabled, p_automation_enabled;
  else
    execute format(
      'update %I.locations
       set
         name = case when $2 is null then name else coalesce(nullif($2, ''''), ''Sede principal'') end,
         address = case when $3 is null then address else nullif($3, '''') end,
         phone = case when $4 is null then phone else nullif($4, '''') end,
         delivery_fee_fixed = coalesce($5, delivery_fee_fixed),
         pickup_enabled = coalesce($6, pickup_enabled),
         delivery_enabled = coalesce($7, delivery_enabled),
         automation_enabled = coalesce($8, automation_enabled),
         updated_at = now()
       where id = $1',
      tenant_schema
    )
    using location_id, p_name, p_address, p_phone, p_delivery_fee_fixed, p_pickup_enabled, p_delivery_enabled, p_automation_enabled;
  end if;

  execute format(
    'select to_jsonb(l)
     from %I.locations l
     where l.id = $1',
    tenant_schema
  )
  into location_payload
  using location_id;

  return location_payload;
end;
$_$;


ALTER FUNCTION "control"."update_tenant_primary_location"("p_schema_name" "text", "p_name" "text", "p_address" "text", "p_phone" "text", "p_delivery_fee_fixed" integer, "p_pickup_enabled" boolean, "p_delivery_enabled" boolean, "p_automation_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "tenant_demo"."enforce_max_active_payment_accounts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
       begin
         if new.is_active then
           if (
             select count(*)
             from tenant_demo.payment_accounts
             where location_id = new.location_id
               and is_active = true
               and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
           ) >= 5 then
             raise exception 'accounts_active_limit_reached';
           end if;
         end if;

         new.updated_at := now();
         return new;
       end;
       $$;


ALTER FUNCTION "tenant_demo"."enforce_max_active_payment_accounts"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "control"."tenant_ai_provider_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "provider_id" "text" NOT NULL,
    "auth_mode" "text" DEFAULT 'api_key'::"text" NOT NULL,
    "encrypted_api_key" "text",
    "encrypted_access_token" "text",
    "default_model" "text",
    "provider_extra" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_ai_provider_configs_auth_mode_check" CHECK (("auth_mode" = ANY (ARRAY['api_key'::"text", 'oauth'::"text", 'custom'::"text"]))),
    CONSTRAINT "tenant_ai_provider_configs_provider_id_check" CHECK (("provider_id" = ANY (ARRAY['gemini'::"text", 'openai'::"text", 'openrouter'::"text", 'anthropic'::"text", 'custom'::"text"]))),
    CONSTRAINT "tenant_ai_provider_configs_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "control"."tenant_ai_provider_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "control"."tenant_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "phone_number_id" "text" NOT NULL,
    "waba_id" "text" NOT NULL,
    "display_phone_number" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_channels_provider_check" CHECK (("provider" = 'whatsapp_cloud'::"text")),
    CONSTRAINT "tenant_channels_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "control"."tenant_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "control"."tenant_users" (
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_users_role_check" CHECK (("role" = ANY (ARRAY['encargado'::"text", 'trabajador'::"text"]))),
    CONSTRAINT "tenant_users_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "control"."tenant_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "control"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "schema_name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "timezone" "text" DEFAULT 'America/Bogota'::"text" NOT NULL,
    "currency" "text" DEFAULT 'COP'::"text" NOT NULL,
    "automation_enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenants_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'suspended'::"text"])))
);


ALTER TABLE "control"."tenants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "control"."webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "event_id" "text",
    "provider_message_id" "text",
    "phone_number_id" "text",
    "tenant_id" "uuid",
    "payload" "jsonb" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "error_message" "text",
    CONSTRAINT "webhook_events_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'processed'::"text", 'duplicate'::"text", 'failed'::"text"])))
);


ALTER TABLE "control"."webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."app_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid",
    "draft_order_id" "uuid",
    "order_id" "uuid",
    "event_name" "text" NOT NULL,
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "source" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "tenant_demo"."app_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."combo_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "combo_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "is_required" boolean DEFAULT true NOT NULL,
    "group_name" "text",
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "tenant_demo"."combo_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."combos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "tenant_demo"."combos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "state" "text" DEFAULT 'new'::"text" NOT NULL,
    "current_draft_order_id" "uuid",
    "manual_reason" "text",
    "last_inbound_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "clarification_attempts" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "conversations_channel_check" CHECK (("channel" = 'whatsapp'::"text"))
);


ALTER TABLE "tenant_demo"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."customer_addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "label" "text",
    "address_text" "text" NOT NULL,
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "raw_location_payload" "jsonb",
    "source" "text" DEFAULT 'text'::"text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customer_addresses_source_check" CHECK (("source" = ANY (ARRAY['text'::"text", 'whatsapp_location'::"text", 'dashboard'::"text"])))
);


ALTER TABLE "tenant_demo"."customer_addresses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."customer_billing_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "billing_type" "text" NOT NULL,
    "full_name" "text",
    "billing_address" "text",
    "legal_name" "text",
    "tax_id" "text",
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customer_billing_profiles_billing_fields_check" CHECK (((("billing_type" = 'normal'::"text") AND ("full_name" IS NOT NULL) AND (NULLIF(TRIM(BOTH FROM "full_name"), ''::"text") IS NOT NULL)) OR (("billing_type" = 'electronic'::"text") AND ("legal_name" IS NOT NULL) AND (NULLIF(TRIM(BOTH FROM "legal_name"), ''::"text") IS NOT NULL) AND ("tax_id" IS NOT NULL) AND (NULLIF(TRIM(BOTH FROM "tax_id"), ''::"text") IS NOT NULL) AND ("email" IS NOT NULL) AND (NULLIF(TRIM(BOTH FROM "email"), ''::"text") IS NOT NULL)))),
    CONSTRAINT "customer_billing_profiles_billing_type_check" CHECK (("billing_type" = ANY (ARRAY['normal'::"text", 'electronic'::"text"])))
);


ALTER TABLE "tenant_demo"."customer_billing_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone" "text" NOT NULL,
    "name" "text",
    "default_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "tenant_demo"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."draft_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "draft_order_id" "uuid" NOT NULL,
    "menu_item_id" "uuid",
    "product_id" "uuid",
    "combo_id" "uuid",
    "name_snapshot" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "unit_price" integer NOT NULL,
    "options_snapshot" "jsonb",
    "notes" "text",
    "line_total" integer NOT NULL
);


ALTER TABLE "tenant_demo"."draft_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."draft_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "fulfillment_type" "text",
    "delivery_address" "text",
    "payment_method" "text",
    "subtotal" integer DEFAULT 0 NOT NULL,
    "delivery_fee" integer DEFAULT 0 NOT NULL,
    "discount_total" integer DEFAULT 0 NOT NULL,
    "total" integer DEFAULT 0 NOT NULL,
    "validation_errors" "jsonb",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivery_address_id" "uuid",
    "service_timing" "text" DEFAULT 'asap'::"text" NOT NULL,
    "scheduled_for" timestamp with time zone,
    "billing_type" "text",
    "billing_profile_id" "uuid",
    "billing_full_name" "text",
    "billing_address" "text",
    "billing_legal_name" "text",
    "billing_tax_id" "text",
    "billing_email" "text",
    "customer_address_text" "text",
    "customer_latitude" double precision,
    "customer_longitude" double precision,
    "delivery_distance_km" double precision,
    "is_inside_delivery_coverage" boolean,
    "coverage_validation_method" "text",
    "coverage_confidence" "text",
    "coverage_checked_at" timestamp with time zone,
    CONSTRAINT "draft_orders_billing_type_check" CHECK ((("billing_type" IS NULL) OR ("billing_type" = ANY (ARRAY['normal'::"text", 'electronic'::"text"])))),
    CONSTRAINT "draft_orders_coverage_confidence_check" CHECK ((("coverage_confidence" IS NULL) OR ("coverage_confidence" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text", 'failed'::"text"])))),
    CONSTRAINT "draft_orders_coverage_validation_method_check" CHECK ((("coverage_validation_method" IS NULL) OR ("coverage_validation_method" = ANY (ARRAY['whatsapp_location'::"text", 'written_address_reference'::"text", 'geocoded_address'::"text", 'not_validated'::"text"])))),
    CONSTRAINT "draft_orders_customer_latitude_check" CHECK ((("customer_latitude" IS NULL) OR (("customer_latitude" >= ('-90'::integer)::double precision) AND ("customer_latitude" <= (90)::double precision)))),
    CONSTRAINT "draft_orders_customer_longitude_check" CHECK ((("customer_longitude" IS NULL) OR (("customer_longitude" >= ('-180'::integer)::double precision) AND ("customer_longitude" <= (180)::double precision)))),
    CONSTRAINT "draft_orders_delivery_distance_km_check" CHECK ((("delivery_distance_km" IS NULL) OR ("delivery_distance_km" >= (0)::double precision))),
    CONSTRAINT "draft_orders_fulfillment_type_check" CHECK (("fulfillment_type" = ANY (ARRAY['delivery'::"text", 'pickup'::"text"]))),
    CONSTRAINT "draft_orders_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'transfer'::"text"]))),
    CONSTRAINT "draft_orders_service_timing_check" CHECK (("service_timing" = ANY (ARRAY['asap'::"text", 'scheduled'::"text"])))
);


ALTER TABLE "tenant_demo"."draft_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."human_intervention_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid",
    "draft_order_id" "uuid",
    "order_id" "uuid",
    "type" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "human_intervention_alerts_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'acknowledged'::"text", 'resolved'::"text"])))
);


ALTER TABLE "tenant_demo"."human_intervention_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "phone" "text",
    "delivery_fee_fixed" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pickup_enabled" boolean DEFAULT true NOT NULL,
    "delivery_enabled" boolean DEFAULT true NOT NULL,
    "automation_enabled" boolean DEFAULT true NOT NULL,
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "opening_hours" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "coverage_config" "jsonb" DEFAULT '{"type": "none"}'::"jsonb" NOT NULL,
    "restaurant_city" "text",
    "restaurant_department" "text",
    "restaurant_country" "text" DEFAULT 'Colombia'::"text" NOT NULL,
    "delivery_radius_km" double precision DEFAULT 3 NOT NULL,
    "allow_written_address_reference" boolean DEFAULT true NOT NULL,
    "try_geocode_written_addresses" boolean DEFAULT false NOT NULL,
    "allow_out_of_coverage_orders" boolean DEFAULT false NOT NULL,
    "request_location_message" "text" DEFAULT 'Perfecto. Para validar si tenemos cobertura, por favor envianos tu ubicacion actual usando el boton de ubicacion de WhatsApp.'::"text" NOT NULL,
    "written_address_fallback_message" "text" DEFAULT 'Para evitar errores con el domicilio, necesitamos validar tu ubicacion exacta. Por favor envianos tu ubicacion usando el boton de ubicacion de WhatsApp. Tambien guardaremos tu direccion escrita como referencia para el domiciliario.'::"text" NOT NULL,
    "out_of_coverage_message" "text" DEFAULT 'Lo sentimos, por ahora no tenemos cobertura para tu ubicacion. Puedes recoger en el local.'::"text" NOT NULL,
    CONSTRAINT "locations_delivery_radius_km_check" CHECK ((("delivery_radius_km" > (0)::double precision) AND ("delivery_radius_km" <= (30)::double precision))),
    CONSTRAINT "locations_latitude_check" CHECK ((("latitude" IS NULL) OR (("latitude" >= ('-90'::integer)::numeric) AND ("latitude" <= (90)::numeric)))),
    CONSTRAINT "locations_longitude_check" CHECK ((("longitude" IS NULL) OR (("longitude" >= ('-180'::integer)::numeric) AND ("longitude" <= (180)::numeric))))
);


ALTER TABLE "tenant_demo"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."menu_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "menu_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "combo_id" "uuid",
    "display_name" "text",
    "price_override" integer,
    "available_quantity" integer,
    "is_available" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "aliases" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "menu_items_check" CHECK (((("product_id" IS NOT NULL) AND ("combo_id" IS NULL)) OR (("product_id" IS NULL) AND ("combo_id" IS NOT NULL))))
);


ALTER TABLE "tenant_demo"."menu_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."menus" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "published_at" timestamp with time zone,
    CONSTRAINT "menus_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"])))
);


ALTER TABLE "tenant_demo"."menus" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid",
    "direction" "text" NOT NULL,
    "provider" "text" DEFAULT 'whatsapp_cloud'::"text" NOT NULL,
    "provider_message_id" "text",
    "message_type" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "text" "text",
    "payload" "jsonb",
    "status" "text" DEFAULT 'logged'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"])))
);


ALTER TABLE "tenant_demo"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "combo_id" "uuid",
    "name_snapshot" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "unit_price" integer NOT NULL,
    "options_snapshot" "jsonb",
    "notes" "text",
    "line_total" integer NOT NULL,
    "menu_item_id" "uuid",
    "category_snapshot" "text"
);


ALTER TABLE "tenant_demo"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "draft_order_id" "uuid",
    "customer_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "fulfillment_type" "text" NOT NULL,
    "delivery_address" "text",
    "payment_method" "text" NOT NULL,
    "payment_proof_file_id" "uuid",
    "subtotal" integer NOT NULL,
    "delivery_fee" integer NOT NULL,
    "discount_total" integer DEFAULT 0 NOT NULL,
    "total" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivery_address_id" "uuid",
    "service_timing" "text" DEFAULT 'asap'::"text" NOT NULL,
    "scheduled_for" timestamp with time zone,
    "restaurant_confirmed_at" timestamp with time zone,
    "payment_confirmed_at" timestamp with time zone,
    "restaurant_reviewed_at" timestamp with time zone,
    "restaurant_reviewed_by" "uuid",
    "restaurant_confirmed_by" "uuid",
    "restaurant_review_note" "text",
    "restaurant_review_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "customer_notified_at" timestamp with time zone,
    "customer_notification_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "customer_notification_error" "text",
    "billing_type" "text",
    "billing_profile_id" "uuid",
    "billing_full_name" "text",
    "billing_address" "text",
    "billing_legal_name" "text",
    "billing_tax_id" "text",
    "billing_email" "text",
    "customer_address_text" "text",
    "customer_latitude" double precision,
    "customer_longitude" double precision,
    "delivery_distance_km" double precision,
    "is_inside_delivery_coverage" boolean,
    "coverage_validation_method" "text",
    "coverage_confidence" "text",
    "coverage_checked_at" timestamp with time zone,
    CONSTRAINT "orders_billing_type_check" CHECK ((("billing_type" IS NULL) OR ("billing_type" = ANY (ARRAY['normal'::"text", 'electronic'::"text"])))),
    CONSTRAINT "orders_coverage_confidence_check" CHECK ((("coverage_confidence" IS NULL) OR ("coverage_confidence" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text", 'failed'::"text"])))),
    CONSTRAINT "orders_coverage_validation_method_check" CHECK ((("coverage_validation_method" IS NULL) OR ("coverage_validation_method" = ANY (ARRAY['whatsapp_location'::"text", 'written_address_reference'::"text", 'geocoded_address'::"text", 'not_validated'::"text"])))),
    CONSTRAINT "orders_customer_latitude_check" CHECK ((("customer_latitude" IS NULL) OR (("customer_latitude" >= ('-90'::integer)::double precision) AND ("customer_latitude" <= (90)::double precision)))),
    CONSTRAINT "orders_customer_longitude_check" CHECK ((("customer_longitude" IS NULL) OR (("customer_longitude" >= ('-180'::integer)::double precision) AND ("customer_longitude" <= (180)::double precision)))),
    CONSTRAINT "orders_customer_notification_status_check" CHECK (("customer_notification_status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text"]))),
    CONSTRAINT "orders_delivery_distance_km_check" CHECK ((("delivery_distance_km" IS NULL) OR ("delivery_distance_km" >= (0)::double precision))),
    CONSTRAINT "orders_fulfillment_type_check" CHECK (("fulfillment_type" = ANY (ARRAY['delivery'::"text", 'pickup'::"text"]))),
    CONSTRAINT "orders_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'transfer'::"text"]))),
    CONSTRAINT "orders_service_timing_check" CHECK (("service_timing" = ANY (ARRAY['asap'::"text", 'scheduled'::"text"])))
);


ALTER TABLE "tenant_demo"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."payment_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "bank_name" "text" NOT NULL,
    "account_number" "text" NOT NULL,
    "holder_name" "text" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_accounts_account_number_check" CHECK (("length"("btrim"("account_number")) > 0)),
    CONSTRAINT "payment_accounts_bank_name_check" CHECK (("length"("btrim"("bank_name")) > 0)),
    CONSTRAINT "payment_accounts_holder_name_check" CHECK (("length"("btrim"("holder_name")) > 0))
);


ALTER TABLE "tenant_demo"."payment_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."payment_proofs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid",
    "message_id" "uuid",
    "draft_order_id" "uuid",
    "order_id" "uuid",
    "storage_bucket" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "provider_media_id" "text",
    "mime_type" "text",
    "file_size" integer,
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    CONSTRAINT "payment_proofs_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'stored'::"text", 'review_pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "tenant_demo"."payment_proofs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."payment_qrs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "storage_bucket" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text",
    "is_active" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_qrs_label_check" CHECK (("length"("btrim"("label")) > 0)),
    CONSTRAINT "payment_qrs_storage_bucket_check" CHECK (("length"("btrim"("storage_bucket")) > 0)),
    CONSTRAINT "payment_qrs_storage_path_check" CHECK (("length"("btrim"("storage_path")) > 0))
);


ALTER TABLE "tenant_demo"."payment_qrs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."product_option_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "option_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price_delta" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "code" "text",
    "description" "text",
    "aliases" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "tenant_demo"."product_option_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."product_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'single'::"text" NOT NULL,
    "is_required" boolean DEFAULT false NOT NULL,
    "min_select" integer DEFAULT 0 NOT NULL,
    "max_select" integer DEFAULT 1 NOT NULL,
    "code" "text",
    "description" "text",
    "aliases" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "display_mode" "text" DEFAULT 'list'::"text" NOT NULL,
    CONSTRAINT "product_options_display_mode_check" CHECK (("display_mode" = ANY (ARRAY['list'::"text", 'buttons'::"text", 'swatches'::"text", 'text'::"text"]))),
    CONSTRAINT "product_options_type_check" CHECK (("type" = ANY (ARRAY['single'::"text", 'multiple'::"text", 'text'::"text"])))
);


ALTER TABLE "tenant_demo"."product_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "base_price" integer DEFAULT 0 NOT NULL,
    "category" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_url" "text",
    "aliases" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "emoji" "text",
    "product_type" "text" DEFAULT 'simple'::"text" NOT NULL,
    CONSTRAINT "products_product_type_check" CHECK (("product_type" = ANY (ARRAY['simple'::"text", 'composite'::"text"])))
);


ALTER TABLE "tenant_demo"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "tenant_demo"."promotions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "type" "text" DEFAULT 'fixed_amount'::"text" NOT NULL,
    "value" integer DEFAULT 0 NOT NULL,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "promotions_type_check" CHECK (("type" = ANY (ARRAY['fixed_amount'::"text", 'percentage'::"text", 'informational'::"text"])))
);


ALTER TABLE "tenant_demo"."promotions" OWNER TO "postgres";


ALTER TABLE ONLY "control"."tenant_ai_provider_configs"
    ADD CONSTRAINT "tenant_ai_provider_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "control"."tenant_ai_provider_configs"
    ADD CONSTRAINT "tenant_ai_provider_configs_tenant_id_provider_id_key" UNIQUE ("tenant_id", "provider_id");



ALTER TABLE ONLY "control"."tenant_channels"
    ADD CONSTRAINT "tenant_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "control"."tenant_channels"
    ADD CONSTRAINT "tenant_channels_provider_phone_number_id_key" UNIQUE ("provider", "phone_number_id");



ALTER TABLE ONLY "control"."tenant_users"
    ADD CONSTRAINT "tenant_users_pkey" PRIMARY KEY ("tenant_id", "user_id");



ALTER TABLE ONLY "control"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "control"."tenants"
    ADD CONSTRAINT "tenants_schema_name_key" UNIQUE ("schema_name");



ALTER TABLE ONLY "control"."tenants"
    ADD CONSTRAINT "tenants_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "control"."webhook_events"
    ADD CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."app_events"
    ADD CONSTRAINT "app_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."combo_items"
    ADD CONSTRAINT "combo_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."combos"
    ADD CONSTRAINT "combos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."customer_addresses"
    ADD CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."customer_billing_profiles"
    ADD CONSTRAINT "customer_billing_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."customers"
    ADD CONSTRAINT "customers_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "tenant_demo"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."draft_order_items"
    ADD CONSTRAINT "draft_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."draft_orders"
    ADD CONSTRAINT "draft_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."human_intervention_alerts"
    ADD CONSTRAINT "human_intervention_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."menu_items"
    ADD CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."menus"
    ADD CONSTRAINT "menus_location_id_date_key" UNIQUE ("location_id", "date");



ALTER TABLE ONLY "tenant_demo"."menus"
    ADD CONSTRAINT "menus_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."payment_accounts"
    ADD CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."payment_proofs"
    ADD CONSTRAINT "payment_proofs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."payment_qrs"
    ADD CONSTRAINT "payment_qrs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."product_option_values"
    ADD CONSTRAINT "product_option_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."product_options"
    ADD CONSTRAINT "product_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "tenant_demo"."promotions"
    ADD CONSTRAINT "promotions_pkey" PRIMARY KEY ("id");



CREATE INDEX "tenant_ai_provider_configs_tenant_status_idx" ON "control"."tenant_ai_provider_configs" USING "btree" ("tenant_id", "status");



CREATE INDEX "tenant_channels_tenant_id_idx" ON "control"."tenant_channels" USING "btree" ("tenant_id");



CREATE INDEX "webhook_events_phone_number_id_idx" ON "control"."webhook_events" USING "btree" ("phone_number_id");



CREATE UNIQUE INDEX "webhook_events_provider_message_unique_idx" ON "control"."webhook_events" USING "btree" ("provider", "provider_message_id") WHERE ("provider_message_id" IS NOT NULL);



CREATE INDEX "webhook_events_tenant_id_idx" ON "control"."webhook_events" USING "btree" ("tenant_id");



CREATE INDEX "app_events_conversation_id_idx" ON "tenant_demo"."app_events" USING "btree" ("conversation_id");



CREATE INDEX "app_events_draft_order_id_idx" ON "tenant_demo"."app_events" USING "btree" ("draft_order_id");



CREATE INDEX "app_events_event_name_idx" ON "tenant_demo"."app_events" USING "btree" ("event_name");



CREATE INDEX "app_events_order_id_idx" ON "tenant_demo"."app_events" USING "btree" ("order_id");



CREATE INDEX "combo_items_combo_id_idx" ON "tenant_demo"."combo_items" USING "btree" ("combo_id");



CREATE INDEX "combo_items_product_id_idx" ON "tenant_demo"."combo_items" USING "btree" ("product_id");



CREATE INDEX "conversations_current_draft_order_id_idx" ON "tenant_demo"."conversations" USING "btree" ("current_draft_order_id");



CREATE INDEX "conversations_customer_id_idx" ON "tenant_demo"."conversations" USING "btree" ("customer_id");



CREATE INDEX "conversations_expires_at_idx" ON "tenant_demo"."conversations" USING "btree" ("expires_at");



CREATE INDEX "conversations_state_idx" ON "tenant_demo"."conversations" USING "btree" ("state");



CREATE INDEX "customer_addresses_customer_id_idx" ON "tenant_demo"."customer_addresses" USING "btree" ("customer_id");



CREATE UNIQUE INDEX "customer_billing_profiles_customer_type_idx" ON "tenant_demo"."customer_billing_profiles" USING "btree" ("customer_id", "billing_type");



CREATE INDEX "draft_order_items_combo_id_idx" ON "tenant_demo"."draft_order_items" USING "btree" ("combo_id");



CREATE INDEX "draft_order_items_draft_order_id_idx" ON "tenant_demo"."draft_order_items" USING "btree" ("draft_order_id");



CREATE INDEX "draft_order_items_menu_item_id_idx" ON "tenant_demo"."draft_order_items" USING "btree" ("menu_item_id");



CREATE INDEX "draft_order_items_product_id_idx" ON "tenant_demo"."draft_order_items" USING "btree" ("product_id");



CREATE INDEX "draft_orders_billing_profile_id_idx" ON "tenant_demo"."draft_orders" USING "btree" ("billing_profile_id");



CREATE INDEX "draft_orders_conversation_id_idx" ON "tenant_demo"."draft_orders" USING "btree" ("conversation_id");



CREATE INDEX "draft_orders_customer_id_idx" ON "tenant_demo"."draft_orders" USING "btree" ("customer_id");



CREATE INDEX "draft_orders_delivery_address_id_idx" ON "tenant_demo"."draft_orders" USING "btree" ("delivery_address_id");



CREATE INDEX "draft_orders_location_id_idx" ON "tenant_demo"."draft_orders" USING "btree" ("location_id");



CREATE INDEX "human_intervention_alerts_conversation_id_idx" ON "tenant_demo"."human_intervention_alerts" USING "btree" ("conversation_id");



CREATE INDEX "human_intervention_alerts_draft_order_id_idx" ON "tenant_demo"."human_intervention_alerts" USING "btree" ("draft_order_id");



CREATE INDEX "human_intervention_alerts_order_id_idx" ON "tenant_demo"."human_intervention_alerts" USING "btree" ("order_id");



CREATE INDEX "human_intervention_alerts_status_idx" ON "tenant_demo"."human_intervention_alerts" USING "btree" ("status");



CREATE INDEX "menu_items_combo_id_idx" ON "tenant_demo"."menu_items" USING "btree" ("combo_id");



CREATE INDEX "menu_items_menu_id_idx" ON "tenant_demo"."menu_items" USING "btree" ("menu_id");



CREATE INDEX "menu_items_product_id_idx" ON "tenant_demo"."menu_items" USING "btree" ("product_id");



CREATE INDEX "messages_conversation_id_idx" ON "tenant_demo"."messages" USING "btree" ("conversation_id");



CREATE UNIQUE INDEX "messages_provider_message_unique_idx" ON "tenant_demo"."messages" USING "btree" ("provider", "provider_message_id", "direction") WHERE ("provider_message_id" IS NOT NULL);



CREATE INDEX "order_items_combo_id_idx" ON "tenant_demo"."order_items" USING "btree" ("combo_id");



CREATE INDEX "order_items_order_id_idx" ON "tenant_demo"."order_items" USING "btree" ("order_id");



CREATE INDEX "order_items_product_id_idx" ON "tenant_demo"."order_items" USING "btree" ("product_id");



CREATE INDEX "orders_billing_profile_id_idx" ON "tenant_demo"."orders" USING "btree" ("billing_profile_id");



CREATE INDEX "orders_customer_id_idx" ON "tenant_demo"."orders" USING "btree" ("customer_id");



CREATE INDEX "orders_delivery_address_id_idx" ON "tenant_demo"."orders" USING "btree" ("delivery_address_id");



CREATE INDEX "orders_draft_order_id_idx" ON "tenant_demo"."orders" USING "btree" ("draft_order_id");



CREATE INDEX "orders_location_id_idx" ON "tenant_demo"."orders" USING "btree" ("location_id");



CREATE INDEX "orders_payment_proof_file_id_idx" ON "tenant_demo"."orders" USING "btree" ("payment_proof_file_id");



CREATE INDEX "orders_status_idx" ON "tenant_demo"."orders" USING "btree" ("status");



CREATE INDEX "payment_proofs_conversation_id_idx" ON "tenant_demo"."payment_proofs" USING "btree" ("conversation_id");



CREATE INDEX "payment_proofs_draft_order_id_idx" ON "tenant_demo"."payment_proofs" USING "btree" ("draft_order_id");



CREATE INDEX "payment_proofs_message_id_idx" ON "tenant_demo"."payment_proofs" USING "btree" ("message_id");



CREATE INDEX "payment_proofs_order_id_idx" ON "tenant_demo"."payment_proofs" USING "btree" ("order_id");



CREATE INDEX "product_option_values_option_id_idx" ON "tenant_demo"."product_option_values" USING "btree" ("option_id");



CREATE INDEX "product_options_product_id_idx" ON "tenant_demo"."product_options" USING "btree" ("product_id");



CREATE INDEX "tenant_demo_alerts_type_status_created_idx" ON "tenant_demo"."human_intervention_alerts" USING "btree" ("type", "status", "created_at" DESC);



CREATE INDEX "tenant_demo_order_items_menu_item_id_idx" ON "tenant_demo"."order_items" USING "btree" ("menu_item_id");



CREATE INDEX "tenant_demo_orders_customer_notification_status_idx" ON "tenant_demo"."orders" USING "btree" ("customer_notification_status");



CREATE INDEX "tenant_demo_orders_payment_confirmed_at_idx" ON "tenant_demo"."orders" USING "btree" ("payment_confirmed_at");



CREATE INDEX "tenant_demo_orders_restaurant_confirmed_at_idx" ON "tenant_demo"."orders" USING "btree" ("restaurant_confirmed_at");



CREATE INDEX "tenant_demo_orders_restaurant_reviewed_at_idx" ON "tenant_demo"."orders" USING "btree" ("restaurant_reviewed_at");



CREATE INDEX "tenant_demo_payment_accounts_location_idx" ON "tenant_demo"."payment_accounts" USING "btree" ("location_id");



CREATE INDEX "tenant_demo_payment_qrs_location_idx" ON "tenant_demo"."payment_qrs" USING "btree" ("location_id");



CREATE UNIQUE INDEX "tenant_demo_payment_qrs_single_active_idx" ON "tenant_demo"."payment_qrs" USING "btree" ("location_id") WHERE "is_active";



CREATE INDEX "tenant_demo_product_option_values_option_sort_idx" ON "tenant_demo"."product_option_values" USING "btree" ("option_id", "sort_order");



CREATE INDEX "tenant_demo_product_options_product_sort_idx" ON "tenant_demo"."product_options" USING "btree" ("product_id", "sort_order");



CREATE OR REPLACE TRIGGER "enforce_max_active_payment_accounts" BEFORE INSERT OR UPDATE ON "tenant_demo"."payment_accounts" FOR EACH ROW EXECUTE FUNCTION "tenant_demo"."enforce_max_active_payment_accounts"();



ALTER TABLE ONLY "control"."tenant_ai_provider_configs"
    ADD CONSTRAINT "tenant_ai_provider_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id");



ALTER TABLE ONLY "control"."tenant_channels"
    ADD CONSTRAINT "tenant_channels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id");



ALTER TABLE ONLY "control"."tenant_users"
    ADD CONSTRAINT "tenant_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id");



ALTER TABLE ONLY "control"."webhook_events"
    ADD CONSTRAINT "webhook_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id");



ALTER TABLE ONLY "tenant_demo"."app_events"
    ADD CONSTRAINT "app_events_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "tenant_demo"."conversations"("id");



ALTER TABLE ONLY "tenant_demo"."app_events"
    ADD CONSTRAINT "app_events_draft_order_id_fkey" FOREIGN KEY ("draft_order_id") REFERENCES "tenant_demo"."draft_orders"("id");



ALTER TABLE ONLY "tenant_demo"."app_events"
    ADD CONSTRAINT "app_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "tenant_demo"."orders"("id");



ALTER TABLE ONLY "tenant_demo"."combo_items"
    ADD CONSTRAINT "combo_items_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "tenant_demo"."combos"("id");



ALTER TABLE ONLY "tenant_demo"."combo_items"
    ADD CONSTRAINT "combo_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tenant_demo"."products"("id");



ALTER TABLE ONLY "tenant_demo"."conversations"
    ADD CONSTRAINT "conversations_current_draft_order_id_fkey" FOREIGN KEY ("current_draft_order_id") REFERENCES "tenant_demo"."draft_orders"("id");



ALTER TABLE ONLY "tenant_demo"."conversations"
    ADD CONSTRAINT "conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "tenant_demo"."customers"("id");



ALTER TABLE ONLY "tenant_demo"."customer_addresses"
    ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "tenant_demo"."customers"("id");



ALTER TABLE ONLY "tenant_demo"."customer_billing_profiles"
    ADD CONSTRAINT "customer_billing_profiles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "tenant_demo"."customers"("id");



ALTER TABLE ONLY "tenant_demo"."draft_order_items"
    ADD CONSTRAINT "draft_order_items_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "tenant_demo"."combos"("id");



ALTER TABLE ONLY "tenant_demo"."draft_order_items"
    ADD CONSTRAINT "draft_order_items_draft_order_id_fkey" FOREIGN KEY ("draft_order_id") REFERENCES "tenant_demo"."draft_orders"("id");



ALTER TABLE ONLY "tenant_demo"."draft_order_items"
    ADD CONSTRAINT "draft_order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "tenant_demo"."menu_items"("id");



ALTER TABLE ONLY "tenant_demo"."draft_order_items"
    ADD CONSTRAINT "draft_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tenant_demo"."products"("id");



ALTER TABLE ONLY "tenant_demo"."draft_orders"
    ADD CONSTRAINT "draft_orders_billing_profile_id_fkey" FOREIGN KEY ("billing_profile_id") REFERENCES "tenant_demo"."customer_billing_profiles"("id");



ALTER TABLE ONLY "tenant_demo"."draft_orders"
    ADD CONSTRAINT "draft_orders_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "tenant_demo"."conversations"("id");



ALTER TABLE ONLY "tenant_demo"."draft_orders"
    ADD CONSTRAINT "draft_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "tenant_demo"."customers"("id");



ALTER TABLE ONLY "tenant_demo"."draft_orders"
    ADD CONSTRAINT "draft_orders_delivery_address_id_fkey" FOREIGN KEY ("delivery_address_id") REFERENCES "tenant_demo"."customer_addresses"("id");



ALTER TABLE ONLY "tenant_demo"."draft_orders"
    ADD CONSTRAINT "draft_orders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "tenant_demo"."locations"("id");



ALTER TABLE ONLY "tenant_demo"."human_intervention_alerts"
    ADD CONSTRAINT "human_intervention_alerts_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "tenant_demo"."conversations"("id");



ALTER TABLE ONLY "tenant_demo"."human_intervention_alerts"
    ADD CONSTRAINT "human_intervention_alerts_draft_order_id_fkey" FOREIGN KEY ("draft_order_id") REFERENCES "tenant_demo"."draft_orders"("id");



ALTER TABLE ONLY "tenant_demo"."human_intervention_alerts"
    ADD CONSTRAINT "human_intervention_alerts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "tenant_demo"."orders"("id");



ALTER TABLE ONLY "tenant_demo"."menu_items"
    ADD CONSTRAINT "menu_items_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "tenant_demo"."combos"("id");



ALTER TABLE ONLY "tenant_demo"."menu_items"
    ADD CONSTRAINT "menu_items_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "tenant_demo"."menus"("id");



ALTER TABLE ONLY "tenant_demo"."menu_items"
    ADD CONSTRAINT "menu_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tenant_demo"."products"("id");



ALTER TABLE ONLY "tenant_demo"."menus"
    ADD CONSTRAINT "menus_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "tenant_demo"."locations"("id");



ALTER TABLE ONLY "tenant_demo"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "tenant_demo"."conversations"("id");



ALTER TABLE ONLY "tenant_demo"."order_items"
    ADD CONSTRAINT "order_items_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "tenant_demo"."combos"("id");



ALTER TABLE ONLY "tenant_demo"."order_items"
    ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "tenant_demo"."menu_items"("id");



ALTER TABLE ONLY "tenant_demo"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "tenant_demo"."orders"("id");



ALTER TABLE ONLY "tenant_demo"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tenant_demo"."products"("id");



ALTER TABLE ONLY "tenant_demo"."orders"
    ADD CONSTRAINT "orders_billing_profile_id_fkey" FOREIGN KEY ("billing_profile_id") REFERENCES "tenant_demo"."customer_billing_profiles"("id");



ALTER TABLE ONLY "tenant_demo"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "tenant_demo"."customers"("id");



ALTER TABLE ONLY "tenant_demo"."orders"
    ADD CONSTRAINT "orders_delivery_address_id_fkey" FOREIGN KEY ("delivery_address_id") REFERENCES "tenant_demo"."customer_addresses"("id");



ALTER TABLE ONLY "tenant_demo"."orders"
    ADD CONSTRAINT "orders_draft_order_id_fkey" FOREIGN KEY ("draft_order_id") REFERENCES "tenant_demo"."draft_orders"("id");



ALTER TABLE ONLY "tenant_demo"."orders"
    ADD CONSTRAINT "orders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "tenant_demo"."locations"("id");



ALTER TABLE ONLY "tenant_demo"."orders"
    ADD CONSTRAINT "orders_payment_proof_file_id_fkey" FOREIGN KEY ("payment_proof_file_id") REFERENCES "tenant_demo"."payment_proofs"("id");



ALTER TABLE ONLY "tenant_demo"."payment_accounts"
    ADD CONSTRAINT "payment_accounts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "tenant_demo"."locations"("id");



ALTER TABLE ONLY "tenant_demo"."payment_proofs"
    ADD CONSTRAINT "payment_proofs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "tenant_demo"."conversations"("id");



ALTER TABLE ONLY "tenant_demo"."payment_proofs"
    ADD CONSTRAINT "payment_proofs_draft_order_id_fkey" FOREIGN KEY ("draft_order_id") REFERENCES "tenant_demo"."draft_orders"("id");



ALTER TABLE ONLY "tenant_demo"."payment_proofs"
    ADD CONSTRAINT "payment_proofs_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "tenant_demo"."messages"("id");



ALTER TABLE ONLY "tenant_demo"."payment_proofs"
    ADD CONSTRAINT "payment_proofs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "tenant_demo"."orders"("id");



ALTER TABLE ONLY "tenant_demo"."payment_qrs"
    ADD CONSTRAINT "payment_qrs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "tenant_demo"."locations"("id");



ALTER TABLE ONLY "tenant_demo"."product_option_values"
    ADD CONSTRAINT "product_option_values_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "tenant_demo"."product_options"("id");



ALTER TABLE ONLY "tenant_demo"."product_options"
    ADD CONSTRAINT "product_options_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tenant_demo"."products"("id");



ALTER TABLE "control"."tenant_ai_provider_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "control"."tenant_channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "control"."tenant_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "control"."tenants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "control"."webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."app_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."combo_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."combos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."customer_addresses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."customer_billing_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."draft_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."draft_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."human_intervention_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."menu_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."menus" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."payment_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."payment_proofs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."payment_qrs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."product_option_values" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."product_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "tenant_demo"."promotions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant members can read realtime orders" ON "tenant_demo"."orders" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "control"."tenant_users" "tu"
  WHERE (("tu"."tenant_id" = '9a5774e0-e01f-4278-b8ee-8e5c155f12f4'::"uuid") AND ("tu"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("tu"."status" = 'active'::"text")))));



GRANT USAGE ON SCHEMA "control" TO "anon";
GRANT USAGE ON SCHEMA "control" TO "authenticated";
GRANT USAGE ON SCHEMA "control" TO "service_role";



GRANT USAGE ON SCHEMA "tenant_demo" TO "anon";
GRANT USAGE ON SCHEMA "tenant_demo" TO "authenticated";
GRANT USAGE ON SCHEMA "tenant_demo" TO "service_role";



REVOKE ALL ON FUNCTION "control"."get_tenant_admin_snapshot"("p_schema_name" "text", "p_timezone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "control"."get_tenant_admin_snapshot"("p_schema_name" "text", "p_timezone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "control"."provision_restaurant_tenant"("p_name" "text", "p_slug" "text", "p_schema_name" "text", "p_timezone" "text", "p_currency" "text", "p_status" "text", "p_automation_enabled" boolean, "p_location_name" "text", "p_location_address" "text", "p_location_phone" "text", "p_delivery_fee_fixed" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "control"."provision_restaurant_tenant"("p_name" "text", "p_slug" "text", "p_schema_name" "text", "p_timezone" "text", "p_currency" "text", "p_status" "text", "p_automation_enabled" boolean, "p_location_name" "text", "p_location_address" "text", "p_location_phone" "text", "p_delivery_fee_fixed" integer) TO "service_role";



REVOKE ALL ON FUNCTION "control"."update_tenant_primary_location"("p_schema_name" "text", "p_name" "text", "p_address" "text", "p_phone" "text", "p_delivery_fee_fixed" integer, "p_pickup_enabled" boolean, "p_delivery_enabled" boolean, "p_automation_enabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "control"."update_tenant_primary_location"("p_schema_name" "text", "p_name" "text", "p_address" "text", "p_phone" "text", "p_delivery_fee_fixed" integer, "p_pickup_enabled" boolean, "p_delivery_enabled" boolean, "p_automation_enabled" boolean) TO "service_role";



GRANT ALL ON FUNCTION "tenant_demo"."enforce_max_active_payment_accounts"() TO "anon";
GRANT ALL ON FUNCTION "tenant_demo"."enforce_max_active_payment_accounts"() TO "authenticated";
GRANT ALL ON FUNCTION "tenant_demo"."enforce_max_active_payment_accounts"() TO "service_role";



GRANT ALL ON TABLE "control"."tenant_ai_provider_configs" TO "anon";
GRANT ALL ON TABLE "control"."tenant_ai_provider_configs" TO "authenticated";
GRANT ALL ON TABLE "control"."tenant_ai_provider_configs" TO "service_role";



GRANT ALL ON TABLE "control"."tenant_channels" TO "anon";
GRANT ALL ON TABLE "control"."tenant_channels" TO "authenticated";
GRANT ALL ON TABLE "control"."tenant_channels" TO "service_role";



GRANT ALL ON TABLE "control"."tenant_users" TO "anon";
GRANT ALL ON TABLE "control"."tenant_users" TO "authenticated";
GRANT ALL ON TABLE "control"."tenant_users" TO "service_role";



GRANT ALL ON TABLE "control"."tenants" TO "anon";
GRANT ALL ON TABLE "control"."tenants" TO "authenticated";
GRANT ALL ON TABLE "control"."tenants" TO "service_role";



GRANT ALL ON TABLE "control"."webhook_events" TO "anon";
GRANT ALL ON TABLE "control"."webhook_events" TO "authenticated";
GRANT ALL ON TABLE "control"."webhook_events" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."app_events" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."app_events" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."app_events" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."combo_items" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."combo_items" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."combo_items" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."combos" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."combos" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."combos" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."conversations" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."conversations" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."conversations" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."customer_addresses" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."customer_addresses" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."customer_addresses" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."customer_billing_profiles" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."customer_billing_profiles" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."customer_billing_profiles" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."customers" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."customers" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."customers" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."draft_order_items" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."draft_order_items" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."draft_order_items" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."draft_orders" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."draft_orders" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."draft_orders" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."human_intervention_alerts" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."human_intervention_alerts" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."human_intervention_alerts" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."locations" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."locations" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."locations" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."menu_items" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."menu_items" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."menu_items" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."menus" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."menus" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."menus" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."messages" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."messages" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."messages" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."order_items" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."order_items" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."order_items" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."orders" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."orders" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."orders" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."payment_accounts" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."payment_accounts" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."payment_accounts" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."payment_proofs" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."payment_proofs" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."payment_proofs" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."payment_qrs" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."payment_qrs" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."payment_qrs" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."product_option_values" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."product_option_values" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."product_option_values" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."product_options" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."product_options" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."product_options" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."products" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."products" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."products" TO "service_role";



GRANT ALL ON TABLE "tenant_demo"."promotions" TO "anon";
GRANT ALL ON TABLE "tenant_demo"."promotions" TO "authenticated";
GRANT ALL ON TABLE "tenant_demo"."promotions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "control" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "control" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "control" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "control" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "control" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "control" GRANT ALL ON FUNCTIONS TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "control" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "control" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "control" GRANT ALL ON TABLES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tenant_demo" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tenant_demo" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tenant_demo" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tenant_demo" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tenant_demo" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tenant_demo" GRANT ALL ON FUNCTIONS TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tenant_demo" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tenant_demo" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "tenant_demo" GRANT ALL ON TABLES TO "service_role";




