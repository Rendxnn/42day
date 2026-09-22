-- Behavioral checks for the canonical business-profile transactions.
-- Run with: psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/business-link-profiles.sql

begin;

do $$
declare
  v_actor uuid := gen_random_uuid();
  v_request uuid := gen_random_uuid();
  v_profile control.business_profiles%rowtype;
  v_updated control.business_profiles%rowtype;
  v_unit control.dynamic_link_units%rowtype;
  v_result jsonb;
  v_status text;
  v_enabled_count integer;
  v_audit_count integer;
begin
  v_profile := control.create_business_profile(
    v_request,
    'perfil-prueba-' || replace(v_request::text, '-', ''),
    'Negocio de prueba',
    'Titular de prueba',
    'Sede de prueba',
    'Carrera 1 # 2-3',
    null,
    v_actor
  );

  if v_profile.status <> 'draft' or v_profile.revision <> 1 then
    raise exception 'profile draft assertion failed: %', v_profile;
  end if;

  v_updated := control.update_business_profile(
    v_profile.id,
    v_profile.revision,
    v_actor,
    v_profile.display_name,
    v_profile.headline,
    v_profile.location_name,
    v_profile.address,
    jsonb_build_array(
      jsonb_build_object('kind', 'website', 'label', 'Web', 'href', 'https://example.com/', 'enabled', true, 'sort_order', 10),
      jsonb_build_object('kind', 'instagram', 'label', 'Oculto', 'href', 'https://instagram.com/example', 'enabled', false, 'sort_order', 20)
    )
  );

  select count(*) into v_enabled_count
  from control.business_profile_links
  where profile_id = v_profile.id and enabled;
  if v_updated.revision <> 2 or v_enabled_count <> 1 then
    raise exception 'profile update/link assertion failed: revision %, enabled %', v_updated.revision, v_enabled_count;
  end if;

  v_profile := control.publish_business_profile(v_profile.id, v_updated.revision, v_actor);
  if v_profile.status <> 'published' or v_profile.published_at is null then
    raise exception 'profile publication assertion failed: %', v_profile;
  end if;

  insert into control.dynamic_link_units (public_code, label, destination_type, destination_url, profile_id, status)
  values ('000000000991', 'QR perfil prueba', 'profile', 'https://parahoy.thaledon.com/p/' || v_profile.slug, v_profile.id, 'active')
  returning * into v_unit;

  if control.count_active_business_profile_qrs(v_profile.id) <> 1 then
    raise exception 'active QR count assertion failed';
  end if;

  v_result := control.disable_business_profile_and_suspend(v_profile.id, v_profile.revision, v_actor);
  if (v_result ->> 'suspendedUnitCount')::integer <> 1 then
    raise exception 'suspend count assertion failed: %', v_result;
  end if;
  select status into v_status from control.dynamic_link_units where id = v_unit.id;
  if v_status <> 'suspended' then raise exception 'unit was not suspended'; end if;
  select count(*) into v_audit_count from control.dynamic_link_audit_events where unit_id = v_unit.id and event_type = 'suspended';
  if v_audit_count <> 1 then raise exception 'suspension audit assertion failed: %', v_audit_count; end if;
  if control.count_active_business_profile_qrs(v_profile.id) <> 0 then
    raise exception 'active QR count should be zero after suspension';
  end if;
end;
$$;

rollback;
