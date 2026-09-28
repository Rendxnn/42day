-- Behavioral checks for appearance, profile assets, constraints and service-only grants.
-- Run against a clean migrated local database: psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f this-file.
begin;

do $$
declare
  v_actor uuid := gen_random_uuid();
  v_request uuid := gen_random_uuid();
  v_profile control.business_profiles%rowtype;
  v_updated control.business_profiles%rowtype;
  v_asset uuid := gen_random_uuid();
  v_stale_revision integer;
  v_failed boolean := false;
begin
  if has_table_privilege('anon', 'control.business_profile_assets', 'select')
     or has_table_privilege('authenticated', 'control.business_profile_assets', 'select') then
    raise exception 'profile assets are readable by client roles';
  end if;
  if has_function_privilege('authenticated', 'control.update_business_profile_appearance(uuid,integer,uuid,jsonb,uuid,text,boolean)', 'execute') then
    raise exception 'appearance mutation is executable by authenticated';
  end if;

  v_profile := control.create_business_profile(
    v_request, 'estilo-' || replace(v_request::text, '-', ''), 'Perfil Estilo',
    null, null, null, null, v_actor
  );
  v_stale_revision := v_profile.revision;

  insert into control.business_profile_assets (
    id, profile_id, actor_user_id, object_path, content_type, byte_size, sha256, state
  ) values (
    v_asset, v_profile.id, v_actor, v_profile.id::text || '/' || v_asset::text || '.png',
    'image/png', 128, repeat('a', 64), 'staged'
  );

  v_updated := control.update_business_profile_complete(
    v_profile.id, v_profile.revision, v_actor, v_profile.display_name, null, null, null,
    '[]'::jsonb,
    jsonb_build_object(
      'background_color', '#F3E9DF', 'card_color', '#FFFFFF', 'text_color', '#261D18',
      'icon_color', '#6D4D3C', 'icon_mode', 'monochrome'
    ),
    v_asset, 'Logo del negocio'
  );
  if v_updated.revision <> v_profile.revision + 1 or v_updated.avatar_asset_id <> v_asset then
    raise exception 'appearance update or optimistic revision assertion failed';
  end if;
  if not exists (select 1 from control.business_profile_assets where id = v_asset and state = 'active' and activated_at is not null) then
    raise exception 'staged asset did not transition to active';
  end if;
  v_profile := control.publish_business_profile(v_profile.id, v_updated.revision, v_actor);

  begin
    perform control.update_business_profile_complete(
      v_profile.id, v_profile.revision, v_actor, v_profile.display_name, null, null, null,
      '[]'::jsonb,
      jsonb_build_object(
        'background_color', '#FFFFFF', 'card_color', '#FFFFFF', 'text_color', '#FFFFFF',
        'icon_color', '#FFFFFF', 'icon_mode', 'monochrome'
      ),
      v_asset, 'Logo del negocio'
    );
  exception when others then
    v_failed := sqlerrm like '%business_profile_appearance_text_contrast%';
  end;
  if not v_failed then raise exception 'low contrast published-profile edit should fail'; end if;

  v_failed := false;
  begin
    perform control.update_business_profile_complete(
      v_profile.id, v_stale_revision, v_actor, v_profile.display_name, null, null, null,
      '[]'::jsonb,
      jsonb_build_object(
        'background_color', '#F3E9DF', 'card_color', '#FFFFFF', 'text_color', '#261D18',
        'icon_color', '#6D4D3C', 'icon_mode', 'monochrome'
      ),
      v_asset, 'Logo del negocio'
    );
  exception when others then
    v_failed := sqlerrm like '%business_profile_stale%';
  end;
  if not v_failed then raise exception 'stale profile revision should fail'; end if;
end;
$$;

rollback;
