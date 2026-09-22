-- Behavioral checks for the server-side inventory page RPC.
-- Run with: supabase db query --local --file supabase/tests/dynamic-link-pagination.sql

begin;

do $$
declare
  v_page jsonb;
  v_next jsonb;
  v_first_id uuid;
  v_first_code text;
  v_next_id uuid;
  v_next_code text;
begin
  insert into control.dynamic_link_units (public_code, label)
  select lpad(g::text, 12, '0'), format('Lote %s', g)
  from generate_series(1, 251) as series(g);

  v_page := control.list_dynamic_link_units_page(
    p_query => 'Lote 201',
    p_sort => 'code',
    p_direction => 'asc',
    p_page_size => 25
  );

  if jsonb_array_length(v_page -> 'units') <> 1
     or (v_page ->> 'totalCount')::integer <> 1
     or (v_page ->> 'hasNext')::boolean
  then
    raise exception 'filtered inventory page assertion failed: %', v_page;
  end if;

  v_page := control.list_dynamic_link_units_page(
    p_sort => 'code',
    p_direction => 'asc',
    p_page_size => 25
  );
  if jsonb_array_length(v_page -> 'units') <> 25
     or (v_page ->> 'totalCount')::integer <> 251
     or not (v_page ->> 'hasNext')::boolean
  then
    raise exception 'first page assertion failed: %', v_page;
  end if;

  v_first_id := ((v_page -> 'units') -> 0 ->> 'id')::uuid;
  v_first_code := (v_page -> 'units') -> 0 ->> 'public_code';
  v_next := control.list_dynamic_link_units_page(
    p_sort => 'code',
    p_direction => 'asc',
    p_page_size => 25,
    p_cursor_value => v_first_code,
    p_cursor_id => v_first_id
  );
  v_next_id := ((v_next -> 'units') -> 0 ->> 'id')::uuid;
  v_next_code := (v_next -> 'units') -> 0 ->> 'public_code';
  if jsonb_array_length(v_next -> 'units') <> 25
     or (v_next ->> 'totalCount')::integer <> 251
     or v_next_code <= v_first_code
     or v_next_id = v_first_id
  then
    raise exception 'cursor page assertion failed: %', v_next;
  end if;

  begin
    perform control.list_dynamic_link_units_page(p_page_size => 10);
    raise exception 'invalid page size was accepted';
  exception
    when others then
      if sqlerrm <> 'dynamic_link_page_size_invalid' then
        raise;
      end if;
  end;
end;
$$;

rollback;
