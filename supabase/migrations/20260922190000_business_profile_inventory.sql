-- Server-side inventory for business profiles. The dashboard never queries
-- control tables directly; the Worker calls this allowlisted RPC.
create index if not exists business_profiles_updated_id_idx
  on control.business_profiles (updated_at desc, id desc);

create index if not exists business_profiles_created_id_idx
  on control.business_profiles (created_at desc, id desc);

create index if not exists business_profiles_status_updated_id_idx
  on control.business_profiles (status, updated_at desc, id desc);

create index if not exists business_profiles_display_name_lower_idx
  on control.business_profiles (lower(display_name));

create index if not exists business_profiles_slug_idx
  on control.business_profiles (slug);

create or replace function control.list_business_profiles_page(
  p_query text default null,
  p_status text default null,
  p_association text default null,
  p_sort text default 'updatedAt',
  p_direction text default 'desc',
  p_page_size integer default 25,
  p_cursor jsonb default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  sort_column text;
  sort_direction text;
  sort_operator text;
  cursor_value text := nullif(p_cursor ->> 'value', '');
  cursor_id text := nullif(p_cursor ->> 'id', '');
  profiles_json jsonb;
  total_count bigint := 0;
  has_next boolean := false;
  next_cursor jsonb;
begin
  if p_sort not in ('updatedAt', 'createdAt', 'displayName', 'slug', 'status') then
    raise exception 'business_profile_sort_invalid';
  end if;
  if p_direction not in ('asc', 'desc') then
    raise exception 'business_profile_direction_invalid';
  end if;
  if p_page_size not in (25, 50, 100) then
    raise exception 'business_profile_page_size_invalid';
  end if;
  if p_status is not null and p_status not in ('draft', 'published', 'disabled') then
    raise exception 'business_profile_status_invalid';
  end if;
  if p_association is not null and p_association not in ('linked', 'generic') then
    raise exception 'business_profile_association_invalid';
  end if;
  if cursor_value is not null and cursor_id is null then
    raise exception 'invalid_profile_cursor';
  end if;

  sort_column := case p_sort
    when 'updatedAt' then 'updated_at'
    when 'createdAt' then 'created_at'
    when 'displayName' then 'display_name'
    when 'slug' then 'slug'
    when 'status' then 'status'
  end;
  sort_direction := upper(p_direction);
  sort_operator := case when p_direction = 'desc' then '<' else '>' end;

  execute format($query$
    with base as (
      select
        p.id,
        p.creation_request_id,
        p.slug,
        p.display_name,
        p.headline,
        p.location_name,
        p.address,
        p.status,
        p.revision,
        p.tenant_id,
        p.published_at,
        p.created_by,
        count(dl.id)::integer as active_qr_count,
        p.created_at,
        p.updated_at,
        (p.%1$I)::text as sort_value
      from control.business_profiles p
      left join control.dynamic_link_units dl
        on dl.profile_id = p.id and dl.status = 'active'
      where ($1 is null or (
        lower(p.display_name) like '%%' || lower($1) || '%%'
        or lower(p.slug) like '%%' || lower($1) || '%%'
        or lower(coalesce(p.location_name, '')) like '%%' || lower($1) || '%%'
        or lower(coalesce(p.address, '')) like '%%' || lower($1) || '%%'
      ))
        and ($2 is null or p.status = $2)
        and ($3 is null or (($3 = 'linked') = (p.tenant_id is not null)))
      group by p.id
    ),
    filtered as (
      select base.*, count(*) over () as total_count
      from base
    ),
    eligible as (
      select filtered.*
      from filtered
      where ($4 is null or (
        (sort_value %3$s $4)
        or (sort_value = $4 and id::text %3$s $5)
      ))
    ),
    ordered as (
      select eligible.*,
        row_number() over (order by sort_value %2$s, id %2$s) as row_number
      from eligible
    ),
    visible as (
      select * from ordered where row_number <= $6
    )
    select
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', id,
          'creationRequestId', creation_request_id,
          'slug', slug,
          'displayName', display_name,
          'headline', headline,
          'locationName', location_name,
          'address', address,
          'status', status,
          'revision', revision,
          'tenantId', tenant_id,
          'publishedAt', published_at,
          'association', case when tenant_id is null then 'generic' else 'linked' end,
          'activeQrCount', active_qr_count,
          'createdAt', created_at,
          'updatedAt', updated_at
        ) order by row_number) filter (where row_number <= $7)
        from visible
      ), '[]'::jsonb),
      coalesce((select max(total_count) from filtered), 0),
      ((select count(*) from ordered) > $7),
      (select jsonb_build_object('value', sort_value, 'id', id)
         from visible where row_number <= $7 order by row_number desc limit 1)
    $query$, sort_column, sort_direction, sort_operator)
  into profiles_json, total_count, has_next, next_cursor
  using nullif(trim(p_query), ''), p_status, p_association, cursor_value, cursor_id, p_page_size + 1, p_page_size;

  return jsonb_build_object(
    'profiles', profiles_json,
    'totalCount', total_count,
    'pageInfo', jsonb_build_object(
      'hasNext', has_next,
      'nextCursor', case when has_next then next_cursor else null end
    )
  );
end;
$$;

revoke all on function control.list_business_profiles_page(text, text, text, text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function control.list_business_profiles_page(text, text, text, text, text, integer, jsonb) to service_role;

notify pgrst, 'reload schema';
