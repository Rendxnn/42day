-- Phase 2: atomically create/publish a lightweight profile and assign it to one QR.
create or replace function control.quick_configure_dynamic_link_with_profile(
  p_unit_id uuid,
  p_expected_revision integer,
  p_actor_user_id uuid,
  p_profile jsonb,
  p_public_base_url text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  unit_row control.dynamic_link_units%rowtype;
  profile_row control.business_profiles%rowtype;
  supplied_links jsonb := coalesce(p_profile -> 'links', '[]'::jsonb);
  v_profile_id uuid := nullif(p_profile ->> 'profile_id', '')::uuid;
  request_id uuid := nullif(p_profile ->> 'creation_request_id', '')::uuid;
  v_target_tenant_id uuid := nullif(p_profile ->> 'tenant_id', '')::uuid;
  v_profile_slug text := lower(trim(coalesce(p_profile ->> 'slug', '')));
  public_base text := rtrim(trim(p_public_base_url), '/');
  updated_unit control.dynamic_link_units%rowtype;
begin
  if p_actor_user_id is null or p_public_base_url is null or public_base = '' then
    raise exception 'dynamic_link_profile_request_invalid';
  end if;
  if jsonb_typeof(p_profile) <> 'object' then raise exception 'business_profile_invalid'; end if;
  select * into unit_row
  from control.dynamic_link_units
  where id = p_unit_id
  for update;
  if not found then raise exception 'dynamic_link_not_found'; end if;
  if unit_row.revision is distinct from p_expected_revision then raise exception 'dynamic_link_stale'; end if;
  if unit_row.status = 'archived' then raise exception 'dynamic_link_archived'; end if;

  if v_profile_id is not null then
    select * into profile_row from control.business_profiles where id = v_profile_id for update;
    if not found then raise exception 'business_profile_not_found'; end if;
    if profile_row.status <> 'published' then raise exception 'business_profile_not_published'; end if;
  else
    if request_id is null or v_profile_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
      raise exception 'business_profile_request_invalid';
    end if;
    select * into profile_row from control.business_profiles where creation_request_id = request_id for update;
    if not found then
      if p_profile ->> 'display_name' is null or length(trim(p_profile ->> 'display_name')) not between 1 and 160 then
        raise exception 'business_profile_display_name_invalid';
      end if;
      if exists (select 1 from control.business_profiles where slug = v_profile_slug) then
        raise exception 'business_profile_slug_conflict';
      end if;
      if v_target_tenant_id is not null and not exists (select 1 from control.tenants where id = v_target_tenant_id and status = 'active') then
        raise exception 'business_profile_tenant_invalid';
      end if;
      insert into control.business_profiles (
        creation_request_id, slug, tenant_id, display_name, headline, location_name,
        address, status, revision, created_by
      ) values (
        request_id, v_profile_slug, v_target_tenant_id,
        left(trim(p_profile ->> 'display_name'), 160),
        nullif(left(trim(coalesce(p_profile ->> 'headline', '')), 180), ''),
        nullif(left(trim(coalesce(p_profile ->> 'location_name', '')), 160), ''),
        nullif(left(trim(coalesce(p_profile ->> 'address', '')), 500), ''),
        'draft', 1, p_actor_user_id
      ) returning * into profile_row;
    end if;
    if profile_row.status = 'disabled' then raise exception 'business_profile_disabled'; end if;
    if jsonb_typeof(supplied_links) <> 'array' or jsonb_array_length(supplied_links) > 30 then
      raise exception 'business_profile_links_invalid';
    end if;
    -- Reuse the canonical update path so restaurant legacy columns remain dual-written.
    select * into profile_row from control.update_business_profile(
      profile_row.id,
      profile_row.revision,
      p_actor_user_id,
      profile_row.display_name,
      profile_row.headline,
      profile_row.location_name,
      profile_row.address,
      supplied_links
    );
    select * into profile_row from control.publish_business_profile(profile_row.id, profile_row.revision, p_actor_user_id);
  end if;

  if public_base !~ '^https://[^/]+$' then raise exception 'dynamic_link_profile_base_invalid'; end if;
  update control.dynamic_link_units
  set destination_type = 'profile',
      destination_url = public_base || '/p/' || profile_row.slug,
      profile_id = profile_row.id,
      tenant_id = profile_row.tenant_id,
      location_id = null,
      location_label_snapshot = profile_row.location_name,
      status = 'active',
      activated_at = case when unit_row.status <> 'active' then now() else unit_row.activated_at end,
      revision = unit_row.revision + 1,
      updated_at = now()
  where id = unit_row.id
  returning * into updated_unit;

  insert into control.dynamic_link_audit_events (
    unit_id, batch_id, actor_user_id, event_type, before_state, after_state, metadata
  ) values (
    unit_row.id, unit_row.batch_id, p_actor_user_id,
    case when unit_row.status = 'active' then 'updated' else 'activated' end,
    jsonb_build_object('status', unit_row.status, 'revision', unit_row.revision, 'destination_type', unit_row.destination_type),
    jsonb_build_object('status', updated_unit.status, 'revision', updated_unit.revision, 'destination_type', updated_unit.destination_type),
    jsonb_build_object('profile_id', profile_row.id, 'source', 'quick_configuration')
  );
  return jsonb_build_object('unit', to_jsonb(updated_unit), 'profile_id', profile_row.id, 'profile_slug', profile_row.slug);
end;
$$;

-- Phase 3: all-or-nothing bulk configuration with stable locks and idempotency.
create or replace function control.apply_dynamic_link_bulk_configuration(
  p_operation_id uuid,
  p_actor_user_id uuid,
  p_units jsonb,
  p_target jsonb,
  p_consented_active_ids jsonb,
  p_command_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  operation_row control.dynamic_link_bulk_operations%rowtype;
  profile_row control.business_profiles%rowtype;
  unit_spec record;
  current_unit control.dynamic_link_units%rowtype;
  updated_unit control.dynamic_link_units%rowtype;
  output_units jsonb := '[]'::jsonb;
  unit_count integer;
  v_target_kind text := p_target ->> 'kind';
  v_destination_type text := p_target ->> 'destination_type';
  v_destination_url text := nullif(p_target ->> 'destination_url', '');
  v_profile_id uuid := nullif(p_target ->> 'profile_id', '')::uuid;
  v_association_mode text := coalesce(p_target ->> 'association_mode', 'preserve');
  v_target_tenant_id uuid := nullif(p_target ->> 'tenant_id', '')::uuid;
  operation_result jsonb;
begin
  if p_operation_id is null or p_actor_user_id is null or p_command_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'dynamic_link_bulk_request_invalid';
  end if;
  if jsonb_typeof(p_units) <> 'array' then raise exception 'dynamic_link_bulk_units_invalid'; end if;
  unit_count := jsonb_array_length(p_units);
  if unit_count < 2 or unit_count > 100 then raise exception 'dynamic_link_bulk_size_invalid'; end if;
  if jsonb_typeof(coalesce(p_consented_active_ids, '[]'::jsonb)) <> 'array' then raise exception 'dynamic_link_bulk_consent_invalid'; end if;

  select * into operation_row from control.dynamic_link_bulk_operations where operation_id = p_operation_id for update;
  if found then
    if operation_row.command_hash <> p_command_hash then raise exception 'dynamic_link_bulk_operation_reuse'; end if;
    return operation_row.result;
  end if;
  insert into control.dynamic_link_bulk_operations (operation_id, actor_user_id, command_hash, result)
  values (p_operation_id, p_actor_user_id, p_command_hash, jsonb_build_object('status', 'running'))
  returning * into operation_row;

  if v_target_kind = 'profile' then
    if v_profile_id is null then raise exception 'business_profile_required'; end if;
    select * into profile_row from control.business_profiles where id = v_profile_id for update;
    if not found then raise exception 'business_profile_not_found'; end if;
    if profile_row.status = 'disabled' then raise exception 'business_profile_disabled'; end if;
    if profile_row.status = 'draft' then
      update control.business_profiles set status = 'published', published_at = now(), revision = revision + 1, updated_at = now()
      where id = v_profile_id returning * into profile_row;
    elsif profile_row.status <> 'published' then
      raise exception 'business_profile_not_published';
    end if;
    v_destination_type := 'profile';
    v_destination_url := nullif(p_target ->> 'destination_url', '');
    if v_destination_url is null then raise exception 'dynamic_link_destination_required'; end if;
    v_association_mode := 'set';
    v_target_tenant_id := profile_row.tenant_id;
  elsif v_target_kind = 'redirect' then
    if v_destination_type not in ('google_review','website','menu','whatsapp','instagram') or v_destination_url is null then
      raise exception 'dynamic_link_destination_invalid';
    end if;
    if v_association_mode not in ('preserve','clear','set') then raise exception 'dynamic_link_association_invalid'; end if;
    if v_association_mode = 'set' and v_target_tenant_id is null then raise exception 'dynamic_link_tenant_invalid'; end if;
  else
    raise exception 'dynamic_link_bulk_target_invalid';
  end if;

  -- jsonb_to_recordset is ordered by id so every concurrent operation locks rows identically.
  for unit_spec in
    select * from jsonb_to_recordset(p_units) as x(id uuid, revision integer) order by id
  loop
    select * into current_unit from control.dynamic_link_units where id = unit_spec.id for update;
    if not found then raise exception 'dynamic_link_not_found'; end if;
    if current_unit.revision is distinct from unit_spec.revision then raise exception 'dynamic_link_stale'; end if;
    if current_unit.status = 'archived' then raise exception 'dynamic_link_archived'; end if;
    if current_unit.status = 'active' and not (coalesce(p_consented_active_ids, '[]'::jsonb) ? current_unit.id::text) then
      raise exception 'dynamic_link_bulk_active_consent_required';
    end if;

    update control.dynamic_link_units
    set destination_type = v_destination_type,
        destination_url = v_destination_url,
        profile_id = case when v_target_kind = 'profile' then v_profile_id else null end,
        tenant_id = case when v_target_kind = 'profile' then v_target_tenant_id when v_association_mode = 'clear' then null when v_association_mode = 'set' then v_target_tenant_id else current_unit.tenant_id end,
        location_id = case when v_target_kind = 'profile' or v_association_mode in ('clear','set') then null else current_unit.location_id end,
        location_label_snapshot = case when v_target_kind = 'profile' then profile_row.location_name when v_association_mode in ('clear','set') then null else current_unit.location_label_snapshot end,
        status = 'active',
        activated_at = case when current_unit.status <> 'active' then now() else current_unit.activated_at end,
        revision = current_unit.revision + 1,
        updated_at = now()
    where id = current_unit.id
    returning * into updated_unit;

    insert into control.dynamic_link_audit_events (
      unit_id, batch_id, actor_user_id, event_type, before_state, after_state, metadata, bulk_operation_id
    ) values (
      current_unit.id, current_unit.batch_id, p_actor_user_id,
      case when current_unit.status = 'active' then 'updated' else 'activated' end,
      jsonb_build_object('status', current_unit.status, 'revision', current_unit.revision, 'destination_url', current_unit.destination_url),
      jsonb_build_object('status', updated_unit.status, 'revision', updated_unit.revision, 'destination_url', updated_unit.destination_url),
      jsonb_build_object('source', 'bulk_configuration', 'operation_id', p_operation_id), operation_row.id
    );
    output_units := output_units || jsonb_build_array(jsonb_build_object('id', updated_unit.id, 'publicCode', updated_unit.public_code, 'revision', updated_unit.revision));
  end loop;

  operation_result := jsonb_build_object('operationId', p_operation_id, 'status', 'completed', 'units', output_units, 'completedAt', now());
  update control.dynamic_link_bulk_operations set result = operation_result, completed_at = now() where id = operation_row.id;
  return operation_result;
end;
$$;

-- Phase 4: short-lived NFC handoff sessions. A callback only reports writing.
create or replace function control.create_nfc_handoff_session(
  p_token_hash text,
  p_unit_id uuid,
  p_actor_user_id uuid,
  p_expires_at timestamptz
) returns control.nfc_handoff_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare session_row control.nfc_handoff_sessions%rowtype;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_actor_user_id is null then raise exception 'nfc_handoff_request_invalid'; end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '10 minutes' then raise exception 'nfc_handoff_expiry_invalid'; end if;
  if not exists (select 1 from control.dynamic_link_units where id = p_unit_id and status <> 'archived') then raise exception 'dynamic_link_not_found'; end if;
  insert into control.nfc_handoff_sessions (token_hash, unit_id, actor_user_id, expires_at)
  values (p_token_hash, p_unit_id, p_actor_user_id, p_expires_at)
  returning * into session_row;
  return session_row;
end;
$$;

create or replace function control.consume_nfc_handoff_session(
  p_session_id uuid,
  p_token_hash text,
  p_actor_user_id uuid,
  p_reported_uid text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare session_row control.nfc_handoff_sessions%rowtype;
begin
  if p_session_id is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_actor_user_id is null then raise exception 'nfc_handoff_request_invalid'; end if;
  select * into session_row from control.nfc_handoff_sessions where id = p_session_id for update;
  if not found or session_row.token_hash <> p_token_hash then raise exception 'nfc_handoff_invalid'; end if;
  if session_row.actor_user_id <> p_actor_user_id then raise exception 'nfc_handoff_forbidden'; end if;
  if session_row.used_at is not null then raise exception 'nfc_handoff_used'; end if;
  if session_row.expires_at <= now() then raise exception 'nfc_handoff_expired'; end if;
  if p_reported_uid is not null and length(trim(p_reported_uid)) > 128 then raise exception 'nfc_handoff_uid_invalid'; end if;
  update control.nfc_handoff_sessions
  set used_at = now(), reported_uid = nullif(trim(p_reported_uid), ''), reported_at = case when p_reported_uid is null or trim(p_reported_uid) = '' then null else now() end
  where id = session_row.id
  returning * into session_row;
  return jsonb_build_object('sessionId', session_row.id, 'unitId', session_row.unit_id, 'reportedUid', session_row.reported_uid, 'reportedAt', session_row.reported_at);
end;
$$;

revoke all on function control.quick_configure_dynamic_link_with_profile(uuid, integer, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function control.apply_dynamic_link_bulk_configuration(uuid, uuid, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function control.create_nfc_handoff_session(text, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function control.consume_nfc_handoff_session(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function control.quick_configure_dynamic_link_with_profile(uuid, integer, uuid, jsonb, text) to service_role;
grant execute on function control.apply_dynamic_link_bulk_configuration(uuid, uuid, jsonb, jsonb, jsonb, text) to service_role;
grant execute on function control.create_nfc_handoff_session(text, uuid, uuid, timestamptz) to service_role;
grant execute on function control.consume_nfc_handoff_session(uuid, text, uuid, text) to service_role;
