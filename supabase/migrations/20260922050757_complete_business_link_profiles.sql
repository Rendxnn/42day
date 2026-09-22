-- Forward completion of the provisional business profile schema.
-- The earlier 20260922010509 migration is immutable; this migration adds the
-- idempotency, compatibility and transactional operations required by feature 006.

alter table control.business_profiles
  add column if not exists creation_request_id uuid;

update control.business_profiles
set creation_request_id = md5('business-profile:' || id::text)::uuid
where creation_request_id is null;

alter table control.business_profiles
  alter column creation_request_id set not null;

create unique index if not exists business_profiles_creation_request_id_idx
  on control.business_profiles (creation_request_id);

alter table control.business_profile_links
  drop constraint if exists business_profile_links_profile_id_kind_sort_order_key;

alter table control.business_profile_links
  drop constraint if exists business_profile_links_profile_sort_order_key,
  drop constraint if exists business_profile_links_href_length_check;

alter table control.business_profile_links
  add constraint business_profile_links_profile_sort_order_key unique (profile_id, sort_order),
  add constraint business_profile_links_href_length_check check (length(href) between 1 and 2048);

create unique index if not exists business_profile_links_standard_kind_idx
  on control.business_profile_links (profile_id, kind)
  where kind <> 'custom';

create index if not exists business_profiles_tenant_status_idx
  on control.business_profiles (tenant_id, status);

create or replace function control.prevent_published_business_profile_slug_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'published' and new.slug is distinct from old.slug then
    raise exception 'business_profile_slug_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_published_business_profile_slug_change on control.business_profiles;
create trigger prevent_published_business_profile_slug_change
before update on control.business_profiles
for each row execute function control.prevent_published_business_profile_slug_change();

revoke all on function control.prevent_published_business_profile_slug_change() from public, anon, authenticated;

-- Backfill one canonical profile per tenant with an active location. The
-- legacy columns remain untouched and are still the rollback source of truth.
do $$
declare
  tenant_row record;
  location_row record;
  profile_id uuid;
  profile_slug text;
  slug_base text;
  slug_suffix integer;
  profile_status text;
  enabled boolean;
  zero_actor constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  for tenant_row in
    select id, slug, name, schema_name
    from control.tenants
    where schema_name ~ '^tenant_[a-z0-9_]{2,56}$'
    order by id
  loop
    if not exists (
      select 1 from pg_namespace where nspname = tenant_row.schema_name
    ) then
      continue;
    end if;

    execute format(
      'select id, name, address, phone, public_profile_enabled,
              public_profile_headline, whatsapp_contact, instagram_url,
              facebook_url, tiktok_url, website_url, maps_url, survey_url
         from %I.locations
        where is_active = true
        order by id
        limit 1',
      tenant_row.schema_name
    ) into location_row;

    if location_row.id is null then
      continue;
    end if;

    select id into profile_id
    from control.business_profiles
    where tenant_id = tenant_row.id
    limit 1;

    if profile_id is null then
      slug_base := regexp_replace(
        regexp_replace(lower(coalesce(tenant_row.slug, tenant_row.name)), '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)', '', 'g'
      );
      if slug_base = '' then slug_base := 'negocio'; end if;
      profile_slug := left(slug_base, 70);
      slug_suffix := 1;
      while exists (select 1 from control.business_profiles where slug = profile_slug) loop
        slug_suffix := slug_suffix + 1;
        profile_slug := left(slug_base, 70) || '-' || slug_suffix::text;
      end loop;

      enabled := coalesce(location_row.public_profile_enabled, true);
      profile_status := case when enabled then 'published' else 'disabled' end;
      insert into control.business_profiles (
        creation_request_id, slug, tenant_id, display_name, headline,
        location_name, address, status, revision, created_by, published_at
      ) values (
        md5('business-profile:' || tenant_row.id::text)::uuid,
        profile_slug,
        tenant_row.id,
        left(coalesce(tenant_row.name, tenant_row.slug), 160),
        nullif(left(location_row.public_profile_headline, 180), ''),
        nullif(left(location_row.name, 160), ''),
        nullif(left(location_row.address, 500), ''),
        profile_status,
        1,
        zero_actor,
        case when enabled then now() else null end
      ) returning id into profile_id;
    else
      enabled := exists (
        select 1 from control.business_profiles
        where id = profile_id and status = 'published'
      );
    end if;

    insert into control.business_profile_links (profile_id, kind, label, href, enabled, sort_order)
    values
      (profile_id, 'menu', 'Carta', 'https://parahoy.thaledon.com/carta?tenant=' || tenant_row.slug, enabled, 10),
      (profile_id, 'phone', 'Llamar', 'tel:' || regexp_replace(coalesce(location_row.phone, ''), '[^0-9+]', '', 'g'), enabled and nullif(regexp_replace(coalesce(location_row.phone, ''), '[^0-9+]', '', 'g'), '') is not null, 20),
      (profile_id, 'whatsapp', 'WhatsApp', 'https://wa.me/' || regexp_replace(coalesce(location_row.whatsapp_contact, ''), '[^0-9]', '', 'g'), enabled and nullif(regexp_replace(coalesce(location_row.whatsapp_contact, ''), '[^0-9]', '', 'g'), '') is not null, 30),
      (profile_id, 'instagram', 'Instagram', coalesce(location_row.instagram_url, 'https://instagram.com'), enabled and nullif(location_row.instagram_url, '') is not null, 40),
      (profile_id, 'tiktok', 'TikTok', coalesce(location_row.tiktok_url, 'https://tiktok.com'), enabled and nullif(location_row.tiktok_url, '') is not null, 50),
      (profile_id, 'facebook', 'Facebook', coalesce(location_row.facebook_url, 'https://facebook.com'), enabled and nullif(location_row.facebook_url, '') is not null, 60),
      (profile_id, 'website', 'Sitio web', coalesce(location_row.website_url, 'https://parahoy.thaledon.com'), enabled and nullif(location_row.website_url, '') is not null, 70),
      (profile_id, 'maps', 'Cómo llegar', coalesce(location_row.maps_url, 'https://www.google.com/maps'), enabled and nullif(location_row.maps_url, '') is not null, 80),
      (profile_id, 'survey', 'Encuesta', coalesce(location_row.survey_url, 'https://parahoy.thaledon.com'), enabled and nullif(location_row.survey_url, '') is not null, 90)
    on conflict on constraint business_profile_links_profile_sort_order_key do update
      set label = excluded.label,
          href = excluded.href,
          enabled = excluded.enabled,
          updated_at = now();
  end loop;
end;
$$;

create or replace function control.create_business_profile(
  p_creation_request_id uuid,
  p_slug text,
  p_display_name text,
  p_headline text,
  p_location_name text,
  p_address text,
  p_tenant_id uuid,
  p_actor_user_id uuid
) returns control.business_profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  profile_row control.business_profiles%rowtype;
  normalized_slug text := lower(trim(p_slug));
begin
  if p_creation_request_id is null or p_actor_user_id is null then
    raise exception 'business_profile_request_or_actor_required';
  end if;
  select * into profile_row
  from control.business_profiles
  where creation_request_id = p_creation_request_id
  for update;
  if found then return profile_row; end if;
  if normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'business_profile_slug_invalid';
  end if;
  if p_display_name is null or length(trim(p_display_name)) not between 1 and 160 then
    raise exception 'business_profile_display_name_invalid';
  end if;
  if p_tenant_id is not null and not exists (select 1 from control.tenants where id = p_tenant_id and status = 'active') then
    raise exception 'business_profile_tenant_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtext(normalized_slug));
  if exists (select 1 from control.business_profiles where slug = normalized_slug) then
    raise exception 'business_profile_slug_conflict';
  end if;
  insert into control.business_profiles (
    creation_request_id, slug, display_name, headline, location_name, address,
    tenant_id, status, revision, created_by
  ) values (
    p_creation_request_id, normalized_slug, left(trim(p_display_name), 160),
    nullif(left(trim(coalesce(p_headline, '')), 180), ''),
    nullif(left(trim(coalesce(p_location_name, '')), 160), ''),
    nullif(left(trim(coalesce(p_address, '')), 500), ''),
    p_tenant_id, 'draft', 1, p_actor_user_id
  ) returning * into profile_row;
  return profile_row;
end;
$$;

create or replace function control.update_business_profile(
  p_profile_id uuid,
  p_expected_revision integer,
  p_actor_user_id uuid,
  p_display_name text,
  p_headline text,
  p_location_name text,
  p_address text,
  p_links jsonb
) returns control.business_profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  profile_row control.business_profiles%rowtype;
  link_row record;
  tenant_row record;
  location_id uuid;
  next_revision integer;
begin
  if p_actor_user_id is null then raise exception 'business_profile_actor_required'; end if;
  select * into profile_row from control.business_profiles where id = p_profile_id for update;
  if not found then raise exception 'business_profile_not_found'; end if;
  if profile_row.revision is distinct from p_expected_revision then raise exception 'business_profile_stale'; end if;
  if profile_row.status = 'disabled' then raise exception 'business_profile_disabled'; end if;
  if p_display_name is null or length(trim(p_display_name)) not between 1 and 160 then raise exception 'business_profile_display_name_invalid'; end if;
  if p_links is null or jsonb_typeof(p_links) <> 'array' or jsonb_array_length(p_links) > 30 then raise exception 'business_profile_links_invalid'; end if;

  next_revision := profile_row.revision + 1;
  update control.business_profiles
  set display_name = left(trim(p_display_name), 160),
      headline = nullif(left(trim(coalesce(p_headline, '')), 180), ''),
      location_name = nullif(left(trim(coalesce(p_location_name, '')), 160), ''),
      address = nullif(left(trim(coalesce(p_address, '')), 500), ''),
      revision = next_revision,
      updated_at = now()
  where id = p_profile_id
  returning * into profile_row;

  delete from control.business_profile_links where profile_id = p_profile_id;
  for link_row in select * from jsonb_to_recordset(p_links) as x(kind text, label text, href text, enabled boolean, sort_order integer)
  loop
    if link_row.kind not in ('menu','google_review','instagram','tiktok','website','whatsapp','phone','facebook','maps','survey','custom') then raise exception 'business_profile_link_kind_invalid'; end if;
    if link_row.href is null or length(link_row.href) not between 1 and 2048 then raise exception 'business_profile_link_href_invalid'; end if;
    insert into control.business_profile_links (profile_id, kind, label, href, enabled, sort_order)
    values (p_profile_id, link_row.kind, nullif(left(trim(coalesce(link_row.label, '')), 120), ''), link_row.href, coalesce(link_row.enabled, false), greatest(coalesce(link_row.sort_order, 0), 0));
  end loop;

  if profile_row.tenant_id is not null then
    select id, slug, schema_name into tenant_row from control.tenants where id = profile_row.tenant_id for update;
    if tenant_row.id is not null and exists (select 1 from pg_namespace where nspname = tenant_row.schema_name) then
      execute format('select id from %I.locations where is_active = true order by id limit 1', tenant_row.schema_name) into location_id;
      if location_id is not null then
        execute format(
          'update %I.locations set
             public_profile_enabled = coalesce((select enabled from control.business_profile_links where profile_id = $2 and kind = ''menu'' limit 1), false),
             public_profile_headline = $1,
             phone = (select regexp_replace(href, ''[^0-9+]+'', '''', ''g'') from control.business_profile_links where profile_id = $2 and kind = ''phone'' and enabled limit 1),
             whatsapp_contact = (select regexp_replace(href, ''[^0-9]+'', '''', ''g'') from control.business_profile_links where profile_id = $2 and kind = ''whatsapp'' and enabled limit 1),
             instagram_url = (select href from control.business_profile_links where profile_id = $2 and kind = ''instagram'' and enabled limit 1),
             facebook_url = (select href from control.business_profile_links where profile_id = $2 and kind = ''facebook'' and enabled limit 1),
             tiktok_url = (select href from control.business_profile_links where profile_id = $2 and kind = ''tiktok'' and enabled limit 1),
             website_url = (select href from control.business_profile_links where profile_id = $2 and kind = ''website'' and enabled limit 1),
             maps_url = (select href from control.business_profile_links where profile_id = $2 and kind = ''maps'' and enabled limit 1),
             survey_url = (select href from control.business_profile_links where profile_id = $2 and kind = ''survey'' and enabled limit 1),
             updated_at = now()
           where id = $3',
          tenant_row.schema_name
        ) using profile_row.headline, profile_row.id, location_id;
      end if;
    end if;
  end if;
  return profile_row;
end;
$$;

create or replace function control.publish_business_profile(
  p_profile_id uuid,
  p_expected_revision integer,
  p_actor_user_id uuid
) returns control.business_profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  profile_row control.business_profiles%rowtype;
begin
  if p_actor_user_id is null then raise exception 'business_profile_actor_required'; end if;
  select * into profile_row from control.business_profiles where id = p_profile_id for update;
  if not found then raise exception 'business_profile_not_found'; end if;
  if profile_row.revision is distinct from p_expected_revision then raise exception 'business_profile_stale'; end if;
  if profile_row.status <> 'draft' then raise exception 'business_profile_not_draft'; end if;
  update control.business_profiles
  set status = 'published', published_at = now(), revision = revision + 1, updated_at = now()
  where id = p_profile_id
  returning * into profile_row;
  return profile_row;
end;
$$;

create or replace function control.disable_business_profile_and_suspend(
  p_profile_id uuid,
  p_expected_revision integer,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  profile_row control.business_profiles%rowtype;
  unit_row record;
  affected integer := 0;
begin
  if p_actor_user_id is null then raise exception 'business_profile_actor_required'; end if;
  select * into profile_row from control.business_profiles where id = p_profile_id for update;
  if not found then raise exception 'business_profile_not_found'; end if;
  if profile_row.revision is distinct from p_expected_revision then raise exception 'business_profile_stale'; end if;
  if profile_row.status = 'disabled' then return jsonb_build_object('profile', to_jsonb(profile_row), 'suspendedUnitCount', 0); end if;

  for unit_row in
    select * from control.dynamic_link_units
    where profile_id = p_profile_id and status = 'active'
    order by id
    for update
  loop
    update control.dynamic_link_units
    set status = 'suspended', revision = revision + 1, updated_at = now()
    where id = unit_row.id;
    insert into control.dynamic_link_audit_events (unit_id, batch_id, actor_user_id, event_type, before_state, after_state, metadata)
    values (unit_row.id, unit_row.batch_id, p_actor_user_id, 'suspended', jsonb_build_object('status', unit_row.status, 'revision', unit_row.revision), jsonb_build_object('status', 'suspended', 'revision', unit_row.revision + 1), jsonb_build_object('profile_id', p_profile_id));
    affected := affected + 1;
  end loop;

  update control.business_profiles
  set status = 'disabled', published_at = null, revision = revision + 1, updated_at = now()
  where id = p_profile_id
  returning * into profile_row;
  return jsonb_build_object('profile', to_jsonb(profile_row), 'suspendedUnitCount', affected);
end;
$$;

create or replace function control.count_active_business_profile_qrs(p_profile_id uuid)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from control.dynamic_link_units
  where profile_id = p_profile_id and status = 'active';
$$;

revoke all on function control.create_business_profile(uuid, text, text, text, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function control.update_business_profile(uuid, integer, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function control.publish_business_profile(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function control.disable_business_profile_and_suspend(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function control.count_active_business_profile_qrs(uuid) from public, anon, authenticated;
grant execute on function control.create_business_profile(uuid, text, text, text, text, text, uuid, uuid) to service_role;
grant execute on function control.update_business_profile(uuid, integer, uuid, text, text, text, text, jsonb) to service_role;
grant execute on function control.publish_business_profile(uuid, integer, uuid) to service_role;
grant execute on function control.disable_business_profile_and_suspend(uuid, integer, uuid) to service_role;
grant execute on function control.count_active_business_profile_qrs(uuid) to service_role;

-- Extend the existing audited unit mutation so a profile destination and its
-- foreign key are updated atomically with the same optimistic revision.
create or replace function control.update_dynamic_link_unit(
  p_unit_id uuid,
  p_expected_revision integer,
  p_actor_user_id uuid,
  p_event_type text,
  p_patch jsonb default '{}'::jsonb
) returns control.dynamic_link_units
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current control.dynamic_link_units%rowtype;
  v_updated control.dynamic_link_units%rowtype;
  v_status text;
  v_destination_type text;
  v_destination_url text;
  v_profile_id uuid;
begin
  select * into v_current from control.dynamic_link_units where id = p_unit_id for update;
  if not found then raise exception 'dynamic_link_not_found'; end if;
  if p_actor_user_id is null then raise exception 'dynamic_link_actor_required'; end if;
  if p_expected_revision is distinct from v_current.revision then raise exception 'dynamic_link_stale'; end if;
  if v_current.status = 'archived' then raise exception 'dynamic_link_archived'; end if;
  if p_event_type not in ('updated', 'activated', 'suspended', 'archived', 'qr_printed', 'nfc_programmed', 'nfc_verified', 'nfc_locked') then raise exception 'dynamic_link_event_invalid'; end if;

  v_status := coalesce(nullif(p_patch ->> 'status', ''), v_current.status);
  v_destination_type := case when p_patch ? 'destination_type' then nullif(p_patch ->> 'destination_type', '') else v_current.destination_type end;
  v_destination_url := case when p_patch ? 'destination_url' then nullif(p_patch ->> 'destination_url', '') else v_current.destination_url end;
  v_profile_id := case when p_patch ? 'profile_id' then nullif(p_patch ->> 'profile_id', '')::uuid else v_current.profile_id end;

  if v_status not in ('available', 'active', 'suspended', 'archived') then raise exception 'dynamic_link_status_invalid'; end if;
  if v_destination_type not in ('google_review', 'website', 'menu', 'whatsapp', 'instagram', 'profile') then raise exception 'dynamic_link_destination_type_invalid'; end if;
  if (v_destination_type is null) <> (v_destination_url is null) then raise exception 'dynamic_link_destination_incomplete'; end if;
  if v_destination_type = 'profile' and v_profile_id is null then raise exception 'business_profile_required'; end if;
  if v_destination_type <> 'profile' and v_profile_id is not null then raise exception 'business_profile_destination_mismatch'; end if;
  if v_profile_id is not null and not exists (select 1 from control.business_profiles where id = v_profile_id and status = 'published') then raise exception 'business_profile_not_published'; end if;
  if v_status = 'active' and v_destination_url is null then raise exception 'dynamic_link_destination_required'; end if;
  if v_current.status = 'active' and v_status not in ('active', 'suspended', 'archived') then raise exception 'dynamic_link_transition_invalid'; end if;
  if v_current.status = 'suspended' and v_status not in ('suspended', 'active', 'archived') then raise exception 'dynamic_link_transition_invalid'; end if;

  update control.dynamic_link_units
  set label = case when p_patch ? 'label' then trim(p_patch ->> 'label') else v_current.label end,
      tenant_id = case when p_patch ? 'tenant_id' then nullif(p_patch ->> 'tenant_id', '')::uuid else v_current.tenant_id end,
      location_id = case when p_patch ? 'location_id' then nullif(p_patch ->> 'location_id', '')::uuid else v_current.location_id end,
      location_label_snapshot = case when p_patch ? 'location_label_snapshot' then nullif(p_patch ->> 'location_label_snapshot', '') else v_current.location_label_snapshot end,
      destination_type = v_destination_type,
      destination_url = v_destination_url,
      profile_id = v_profile_id,
      status = v_status,
      nfc_uid = case when p_patch ? 'nfc_uid' then nullif(p_patch ->> 'nfc_uid', '') else v_current.nfc_uid end,
      qr_printed_at = case when p_patch ? 'qr_printed_at' then (p_patch ->> 'qr_printed_at')::timestamptz else v_current.qr_printed_at end,
      nfc_programmed_at = case when p_patch ? 'nfc_programmed_at' then (p_patch ->> 'nfc_programmed_at')::timestamptz else v_current.nfc_programmed_at end,
      nfc_verified_at = case when p_patch ? 'nfc_verified_at' then (p_patch ->> 'nfc_verified_at')::timestamptz else v_current.nfc_verified_at end,
      nfc_locked_at = case when p_patch ? 'nfc_locked_at' then (p_patch ->> 'nfc_locked_at')::timestamptz else v_current.nfc_locked_at end,
      activated_at = case when v_status = 'active' and v_current.status <> 'active' then now() else v_current.activated_at end,
      revision = v_current.revision + 1,
      updated_at = now()
  where id = p_unit_id
  returning * into v_updated;

  insert into control.dynamic_link_audit_events (unit_id, batch_id, actor_user_id, event_type, before_state, after_state, metadata)
  values (v_updated.id, v_updated.batch_id, p_actor_user_id, p_event_type, to_jsonb(v_current), to_jsonb(v_updated), coalesce(p_patch -> 'metadata', '{}'::jsonb));
  return v_updated;
end;
$$;

revoke all on function control.update_dynamic_link_unit(uuid, integer, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function control.update_dynamic_link_unit(uuid, integer, uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
