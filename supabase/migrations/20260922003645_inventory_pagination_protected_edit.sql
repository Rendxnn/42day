create index dynamic_link_units_updated_id_idx
  on control.dynamic_link_units (updated_at desc, id desc);
create index dynamic_link_units_created_id_idx
  on control.dynamic_link_units (created_at desc, id desc);
create index dynamic_link_units_code_id_idx
  on control.dynamic_link_units (public_code asc, id asc);
create index dynamic_link_units_label_id_idx
  on control.dynamic_link_units ((lower(label)), id asc);
create index dynamic_link_units_status_id_idx
  on control.dynamic_link_units (status asc, id asc);

create or replace function control.list_dynamic_link_units_page(
  p_query text default null,
  p_status text default null,
  p_tenant_id uuid default null,
  p_batch_id uuid default null,
  p_sort text default 'updatedAt',
  p_direction text default 'desc',
  p_page_size integer default 25,
  p_cursor_value text default null,
  p_cursor_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_expression text;
  v_cursor_predicate text := 'true';
  v_comparator text;
  v_result jsonb;
begin
  if p_sort not in ('updatedAt', 'createdAt', 'code', 'label', 'status') then
    raise exception 'dynamic_link_sort_invalid';
  end if;
  if p_direction not in ('asc', 'desc') then
    raise exception 'dynamic_link_direction_invalid';
  end if;
  if p_page_size not in (25, 50, 100) then
    raise exception 'dynamic_link_page_size_invalid';
  end if;
  if (p_cursor_value is null) <> (p_cursor_id is null) then
    raise exception 'dynamic_link_cursor_invalid';
  end if;

  v_order_expression := case p_sort
    when 'updatedAt' then 'updated_at'
    when 'createdAt' then 'created_at'
    when 'code' then 'public_code'
    when 'label' then 'lower(label)'
    when 'status' then 'status'
  end;
  v_comparator := case when p_direction = 'asc' then '>' else '<' end;

  if p_cursor_id is not null then
    v_cursor_predicate := case p_sort
      when 'updatedAt' then format('(u.updated_at, u.id) %s ($5::timestamptz, $6::uuid)', v_comparator)
      when 'createdAt' then format('(u.created_at, u.id) %s ($5::timestamptz, $6::uuid)', v_comparator)
      when 'code' then format('(u.public_code, u.id) %s ($5, $6::uuid)', v_comparator)
      when 'label' then format('(lower(u.label), u.id) %s ($5, $6::uuid)', v_comparator)
      when 'status' then format('(u.status, u.id) %s ($5, $6::uuid)', v_comparator)
    end;
  end if;

  execute format($sql$
    with filtered as materialized (
      select u.*
      from control.dynamic_link_units u
      where ($1 is null or u.status = $1)
        and ($2 is null or u.tenant_id = $2::uuid)
        and ($3 is null or u.batch_id = $3::uuid)
        and ($4 is null or u.public_code ilike '%%' || $4 || '%%'
          or u.label ilike '%%' || $4 || '%%'
          or coalesce(u.location_label_snapshot, '') ilike '%%' || $4 || '%%')
    ), page as materialized (
      select * from filtered u
      where %s
      order by %s %s, u.id %s
      limit $7 + 1
    ), visible as materialized (
      select * from page
      order by %s %s, id %s
      limit $7
    )
    select jsonb_build_object(
      'units', coalesce((select jsonb_agg(to_jsonb(visible) order by %s %s, id %s) from visible), '[]'::jsonb),
      'totalCount', (select count(*) from filtered),
      'hasNext', (select count(*) > $7 from page)
    )
  $sql$, v_cursor_predicate, v_order_expression, p_direction, p_direction, v_order_expression, p_direction, p_direction, v_order_expression, p_direction, p_direction)
  into v_result
  using p_status, p_tenant_id::text, p_batch_id::text, nullif(trim(p_query), ''), p_cursor_value, p_cursor_id, p_page_size;

  return v_result;
end;
$$;

revoke all on function control.list_dynamic_link_units_page(text, text, uuid, uuid, text, text, integer, text, uuid) from public, anon, authenticated;
grant execute on function control.list_dynamic_link_units_page(text, text, uuid, uuid, text, text, integer, text, uuid) to service_role;
