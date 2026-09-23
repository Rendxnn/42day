-- Short-lived prepare/commit records for the private ParaHoy agent boundary.
create table if not exists control.business_setup_operations (
  id uuid primary key default gen_random_uuid(),
  preparation_token_hash text not null unique,
  operation_id uuid unique,
  actor_user_id uuid not null,
  oauth_client_id text not null,
  state text not null default 'prepared' check (state in ('prepared', 'committed', 'expired', 'failed')),
  command_hash text,
  proposal jsonb not null,
  qr_unit_id uuid not null references control.dynamic_link_units(id) on delete restrict,
  expected_qr_revision integer not null,
  matching_profile_id uuid references control.business_profiles(id) on delete restrict,
  expected_profile_revision integer,
  result jsonb,
  expires_at timestamptz not null,
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_setup_operations_actor_created_idx
  on control.business_setup_operations (actor_user_id, created_at desc);
create index if not exists business_setup_operations_expires_idx
  on control.business_setup_operations (expires_at) where state = 'prepared';

alter table control.business_setup_operations enable row level security;
alter table control.business_setup_operations force row level security;
revoke all on table control.business_setup_operations from public, anon, authenticated;
grant all on table control.business_setup_operations to service_role;

create or replace function control.commit_business_setup(
  p_preparation_id uuid,
  p_preparation_token_hash text,
  p_operation_id uuid,
  p_actor_user_id uuid,
  p_oauth_client_id text,
  p_command_hash text,
  p_confirmed boolean,
  p_active_qr_consent boolean,
  p_duplicate_profile_id uuid,
  p_public_base_url text,
  p_dynamic_link_base_url text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  operation_row control.business_setup_operations%rowtype;
  unit_row control.dynamic_link_units%rowtype;
  profile_row control.business_profiles%rowtype;
  profile_input jsonb;
  links_input jsonb;
  normalized_links jsonb;
  target_url text;
  qr_url text;
  commit_result jsonb;
  expected_revision integer;
  selected_profile_revision integer;
begin
  if not coalesce(p_confirmed, false) then raise exception 'business_setup_confirmation_required'; end if;
  if p_preparation_id is null or p_operation_id is null or p_actor_user_id is null or p_oauth_client_id is null then
    raise exception 'business_setup_request_invalid';
  end if;
  if p_command_hash is null or p_command_hash !~ '^[0-9a-f]{64}$' then raise exception 'business_setup_command_invalid'; end if;
  if p_public_base_url is null or p_public_base_url !~ '^https://[^/]+$' then raise exception 'business_setup_public_base_invalid'; end if;
  if p_dynamic_link_base_url is null or p_dynamic_link_base_url !~ '^https://[^/]+$' then raise exception 'business_setup_dynamic_base_invalid'; end if;

  select * into operation_row
  from control.business_setup_operations
  where operation_id = p_operation_id
  for update;
  if found then
    if operation_row.actor_user_id <> p_actor_user_id
       or operation_row.oauth_client_id <> p_oauth_client_id
       or operation_row.command_hash is distinct from p_command_hash then
      raise exception 'business_setup_operation_reuse';
    end if;
    return coalesce(operation_row.result, '{}'::jsonb) || jsonb_build_object('replayed', true);
  end if;

  select * into operation_row
  from control.business_setup_operations
  where id = p_preparation_id
    and preparation_token_hash = p_preparation_token_hash
  for update;
  if not found then raise exception 'business_setup_preparation_invalid'; end if;
  if operation_row.actor_user_id <> p_actor_user_id or operation_row.oauth_client_id <> p_oauth_client_id then
    raise exception 'business_setup_preparation_forbidden';
  end if;
  if operation_row.state <> 'prepared' then raise exception 'business_setup_preparation_used'; end if;
  if operation_row.expires_at <= now() then
    update control.business_setup_operations set state = 'expired', updated_at = now() where id = operation_row.id;
    raise exception 'business_setup_preparation_expired';
  end if;

  expected_revision := (operation_row.proposal -> 'qr' ->> 'revision')::integer;
  select * into unit_row from control.dynamic_link_units where id = operation_row.qr_unit_id for update;
  if not found then raise exception 'dynamic_link_not_found'; end if;
  if unit_row.revision is distinct from expected_revision then raise exception 'dynamic_link_stale'; end if;
  if unit_row.status = 'archived' then raise exception 'dynamic_link_archived'; end if;
  if unit_row.status = 'active' and not coalesce(p_active_qr_consent, false) then
    raise exception 'dynamic_link_active_consent_required';
  end if;

  if p_duplicate_profile_id is not null then
    if not exists (
      select 1
      from jsonb_array_elements(coalesce(operation_row.proposal -> 'matchingProfiles', '[]'::jsonb)) candidate
      where candidate ->> 'id' = p_duplicate_profile_id::text
    ) then
      raise exception 'business_setup_duplicate_not_allowed';
    end if;
    select nullif(candidate ->> 'revision', '')::integer into selected_profile_revision
    from jsonb_array_elements(coalesce(operation_row.proposal -> 'matchingProfiles', '[]'::jsonb)) candidate
    where candidate ->> 'id' = p_duplicate_profile_id::text;
    select * into profile_row from control.business_profiles where id = p_duplicate_profile_id for update;
    if not found then raise exception 'business_profile_not_found'; end if;
    if selected_profile_revision is not null and profile_row.revision is distinct from selected_profile_revision then
      raise exception 'business_profile_stale';
    end if;
    if profile_row.status <> 'published' then raise exception 'business_profile_not_published'; end if;
  else
    profile_input := operation_row.proposal -> 'business';
    links_input := coalesce(profile_input -> 'links', '[]'::jsonb);
    if jsonb_typeof(links_input) <> 'array' or jsonb_array_length(links_input) > 30 then raise exception 'business_profile_links_invalid'; end if;
    select * into profile_row from control.create_business_profile(
      (profile_input ->> 'requestId')::uuid,
      profile_input ->> 'slug',
      profile_input ->> 'displayName',
      nullif(profile_input ->> 'headline', ''),
      nullif(profile_input ->> 'locationName', ''),
      nullif(profile_input ->> 'address', ''),
      nullif(profile_input ->> 'tenantId', '')::uuid,
      p_actor_user_id
    );
    select coalesce(jsonb_agg(jsonb_build_object(
      'kind', link ->> 'kind',
      'label', link ->> 'label',
      'href', link ->> 'href',
      'enabled', coalesce((link ->> 'enabled')::boolean, false),
      'sort_order', coalesce((link ->> 'sortOrder')::integer, 0)
    )), '[]'::jsonb) into normalized_links
    from jsonb_array_elements(links_input) link;
    select * into profile_row from control.update_business_profile(
      profile_row.id, profile_row.revision, p_actor_user_id,
      profile_row.display_name, profile_row.headline, profile_row.location_name,
      profile_row.address, normalized_links
    );
    select * into profile_row from control.publish_business_profile(profile_row.id, profile_row.revision, p_actor_user_id);
  end if;

  target_url := rtrim(p_public_base_url, '/') || '/p/' || profile_row.slug;
  qr_url := rtrim(p_dynamic_link_base_url, '/') || '/r/' || unit_row.public_code;
  update control.dynamic_link_units
  set destination_type = 'profile',
      destination_url = target_url,
      profile_id = profile_row.id,
      tenant_id = profile_row.tenant_id,
      location_id = null,
      location_label_snapshot = profile_row.location_name,
      status = 'active',
      activated_at = case when unit_row.status <> 'active' then now() else unit_row.activated_at end,
      revision = unit_row.revision + 1,
      updated_at = now()
  where id = unit_row.id;

  insert into control.dynamic_link_audit_events (
    unit_id, batch_id, actor_user_id, event_type, before_state, after_state, metadata
  ) values (
    unit_row.id, unit_row.batch_id, p_actor_user_id,
    case when unit_row.status = 'active' then 'updated' else 'activated' end,
    jsonb_build_object('status', unit_row.status, 'revision', unit_row.revision, 'destination_url', unit_row.destination_url),
    jsonb_build_object('status', 'active', 'revision', unit_row.revision + 1, 'destination_url', target_url),
    jsonb_build_object('source', 'agent_mcp', 'operation_id', p_operation_id)
  );

  commit_result := jsonb_build_object(
    'operationId', p_operation_id,
    'replayed', false,
    'profile', jsonb_build_object('id', profile_row.id, 'slug', profile_row.slug, 'publicUrl', rtrim(p_public_base_url, '/') || '/p/' || profile_row.slug, 'status', profile_row.status),
    'qr', jsonb_build_object('id', unit_row.id, 'code', unit_row.public_code, 'publicUrl', qr_url, 'revision', unit_row.revision + 1)
  );
  update control.business_setup_operations
  set operation_id = p_operation_id,
      command_hash = p_command_hash,
      state = 'committed',
      result = commit_result,
      committed_at = now(),
      updated_at = now()
  where id = operation_row.id;
  return commit_result;
end;
$$;

revoke all on function control.commit_business_setup(uuid, text, uuid, uuid, text, text, boolean, boolean, uuid, text, text) from public, anon, authenticated;
grant execute on function control.commit_business_setup(uuid, text, uuid, uuid, text, text, boolean, boolean, uuid, text, text) to service_role;

notify pgrst, 'reload schema';
