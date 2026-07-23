create table if not exists control.restaurant_analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references control.tenants(id) on delete cascade,
  range_start date not null,
  range_end date not null,
  timezone text not null,
  payload jsonb not null default '{}'::jsonb,
  previous_payload jsonb not null default '{}'::jsonb,
  calculated_by uuid,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_analytics_snapshots_valid_range check (range_end >= range_start),
  constraint restaurant_analytics_snapshots_tenant_range_key unique (tenant_id, range_start, range_end)
);

create index if not exists restaurant_analytics_snapshots_range_idx
  on control.restaurant_analytics_snapshots (range_start, range_end, calculated_at desc);

alter table control.restaurant_analytics_snapshots enable row level security;
revoke all on table control.restaurant_analytics_snapshots from public, anon, authenticated;

do $$
declare
  target_schema text;
begin
  for target_schema in
    select 'tenant_template'
    union
    select schema_name from control.tenants where schema_name like 'tenant_%'
  loop
    if exists (select 1 from information_schema.tables where table_schema = target_schema and table_name = 'messages') then
      execute format('create index if not exists %I on %I.messages (created_at, conversation_id, direction)', 'messages_created_at_conversation_direction_idx', target_schema);
      execute format('create index if not exists %I on %I.conversations (created_at)', 'conversations_created_at_idx', target_schema);
      execute format('create index if not exists %I on %I.draft_orders (created_at, conversation_id, status)', 'draft_orders_created_at_conversation_status_idx', target_schema);
      execute format('create index if not exists %I on %I.orders (created_at, status, draft_order_id)', 'orders_created_at_status_draft_idx', target_schema);
      execute format('create index if not exists %I on %I.app_events (created_at, event_name, order_id)', 'app_events_created_at_event_order_idx', target_schema);
      execute format('create index if not exists %I on %I.human_intervention_alerts (created_at, type, conversation_id)', 'human_alerts_created_at_type_conversation_idx', target_schema);
    end if;
  end loop;
end;
$$;

create or replace function control.build_restaurant_analytics_payload(
  p_schema_name text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_timezone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
begin
  if p_schema_name !~ '^tenant_[a-z0-9_]+$' then
    raise exception 'invalid_tenant_schema';
  end if;

  execute format($query$
    with period_messages as (
      select id, conversation_id, direction, created_at
      from %1$I.messages
      where created_at >= $1 and created_at < $2
    ),
    inbound_conversations as (
      select distinct conversation_id from period_messages where direction = 'inbound'
    ),
    outbound_conversations as (
      select distinct conversation_id from period_messages where direction = 'outbound'
    ),
    served_conversations as (
      select i.conversation_id
      from inbound_conversations i
      join outbound_conversations o using (conversation_id)
    ),
    period_drafts as (
      select id, conversation_id, status, created_at
      from %1$I.draft_orders
      where created_at >= $1 and created_at < $2
    ),
    purchase_intent as (
      select distinct d.id, d.conversation_id
      from period_drafts d
      join %1$I.draft_order_items i on i.draft_order_id = d.id
    ),
    period_orders as (
      select id, draft_order_id, status, total, created_at, updated_at, restaurant_review_metadata
      from %1$I.orders
      where created_at >= $1 and created_at < $2
    ),
    delivered_orders as (
      select id
      from %1$I.orders
      where status = 'delivered' and updated_at >= $1 and updated_at < $2
    ),
    response_minutes as (
      select extract(epoch from (reply.created_at - message.created_at)) / 60.0 as minutes
      from period_messages message
      join lateral (
        select sent.created_at
        from %1$I.messages sent
        where sent.conversation_id = message.conversation_id
          and sent.direction = 'outbound'
          and sent.created_at >= message.created_at
          and sent.created_at < $2
        order by sent.created_at asc
        limit 1
      ) reply on true
      where message.direction = 'inbound'
    ),
    completion_minutes as (
      select extract(epoch from (o.created_at - c.created_at)) / 60.0 as minutes
      from period_orders o
      join %1$I.draft_orders d on d.id = o.draft_order_id
      join %1$I.conversations c on c.id = d.conversation_id
      where o.created_at >= c.created_at
    ),
    intervention_alerts as (
      select id, conversation_id, type, status, created_at, resolved_at
      from %1$I.human_intervention_alerts
      where created_at >= $1 and created_at < $2
        and type <> 'order_pending_confirmation'
    ),
    manual_corrections as (
      select distinct event.order_id
      from %1$I.app_events event
      where event.created_at >= $1 and event.created_at < $2
        and event.event_name in ('order.out_of_stock_returned_to_customer', 'order.customer_replacement_selected')
        and event.order_id is not null
      union
      select id
      from period_orders
      where restaurant_review_metadata is not null
    ),
    quality as (
      select
        (select count(*) from period_orders)::int as confirmed_orders,
        (select count(*) from manual_corrections)::int as correction_orders,
        (select count(*) from %1$I.app_events event where event.created_at >= $1 and event.created_at < $2 and event.event_name = 'order.out_of_stock_returned_to_customer')::int as unavailable_item_events,
        (select count(*) from %1$I.app_events event where event.created_at >= $1 and event.created_at < $2 and event.event_name = 'order.customer_cancelled_after_out_of_stock')::int as cancelled_after_availability_issue
    ),
    raw_metrics as (
      select
        (select count(*) from inbound_conversations)::int as received,
        (select count(*) from served_conversations)::int as served,
        (select count(*) from purchase_intent)::int as intent,
        (select count(*) from period_drafts)::int as started,
        (select count(*) from period_orders)::int as confirmed,
        (select count(*) from delivered_orders)::int as completed,
        coalesce((select sum(total) from period_orders), 0)::numeric as total_value,
        coalesce((select avg(total) from period_orders), 0)::numeric as average_ticket,
        (select count(distinct conversation_id) from intervention_alerts where conversation_id is not null)::int as intervention_conversations,
        (select count(*) from intervention_alerts)::int as intervention_alerts,
        (select avg(minutes) from response_minutes)::numeric as average_first_response_minutes,
        (select avg(minutes) from completion_minutes)::numeric as average_completion_minutes,
        (select count(*) from response_minutes)::int as response_sample_size,
        (select count(*) from completion_minutes)::int as completion_sample_size
    ),
    activity as (
      select coalesce(jsonb_agg(jsonb_build_object('date', day, 'value', value) order by day) filter (where day is not null), '[]'::jsonb) as daily,
             coalesce(jsonb_agg(jsonb_build_object('hour', hour, 'value', hour_value) order by hour) filter (where hour is not null), '[]'::jsonb) as hourly
      from (
        select to_char(created_at at time zone $3, 'YYYY-MM-DD') as day,
               null::int as hour,
               count(*)::int as value,
               null::int as hour_value
        from period_orders
        group by 1
        union all
        select null::text as day,
               extract(hour from created_at at time zone $3)::int as hour,
               null::int as value,
               count(*)::int as hour_value
        from period_orders
        group by 2
      ) activity_data
    ),
    timing as (
      select jsonb_build_object(
        'averageFirstResponseMinutes', round(coalesce((select average_first_response_minutes from raw_metrics), 0)::numeric, 2),
        'averageCompletionMinutes', round(coalesce((select average_completion_minutes from raw_metrics), 0)::numeric, 2),
        'responseSampleSize', (select response_sample_size from raw_metrics),
        'completionSampleSize', (select completion_sample_size from raw_metrics),
        'completionBuckets', jsonb_build_array(
          jsonb_build_object('key', 'under_3', 'label', '< 3 min', 'value', (select count(*) from completion_minutes where minutes < 3)),
          jsonb_build_object('key', '3_to_5', 'label', '3–5 min', 'value', (select count(*) from completion_minutes where minutes >= 3 and minutes < 5)),
          jsonb_build_object('key', '5_to_10', 'label', '5–10 min', 'value', (select count(*) from completion_minutes where minutes >= 5 and minutes < 10)),
          jsonb_build_object('key', '10_to_15', 'label', '10–15 min', 'value', (select count(*) from completion_minutes where minutes >= 10 and minutes < 15)),
          jsonb_build_object('key', '15_to_30', 'label', '15–30 min', 'value', (select count(*) from completion_minutes where minutes >= 15 and minutes < 30)),
          jsonb_build_object('key', 'over_30', 'label', '> 30 min', 'value', (select count(*) from completion_minutes where minutes >= 30))
        ),
        'underFivePercent', case when (select completion_sample_size from raw_metrics) > 0 then round(100.0 * (select count(*) from completion_minutes where minutes < 5) / (select completion_sample_size from raw_metrics), 1) else null end,
        'underTenPercent', case when (select completion_sample_size from raw_metrics) > 0 then round(100.0 * (select count(*) from completion_minutes where minutes < 10) / (select completion_sample_size from raw_metrics), 1) else null end
      ) as payload
    ),
    intervention as (
      select jsonb_build_object(
        'conversations', (select intervention_conversations from raw_metrics),
        'alerts', (select intervention_alerts from raw_metrics),
        'reasons', coalesce((
          select jsonb_agg(jsonb_build_object('key', type, 'value', value) order by value desc, type)
          from (select type, count(*)::int as value from intervention_alerts group by type) reasons
        ), '[]'::jsonb),
        'unresolved', (select count(*)::int from intervention_alerts where status <> 'resolved')
      ) as payload
    ),
    abandonment as (
      select jsonb_build_object(
        'value', (select count(*)::int from period_drafts where status not in ('confirmed', 'cancelled')),
        'byCurrentState', coalesce((
          select jsonb_agg(jsonb_build_object('key', status, 'value', value) order by value desc, status)
          from (select status, count(*)::int as value from period_drafts where status not in ('confirmed', 'cancelled') group by status) states
        ), '[]'::jsonb),
        'note', 'Los estados se observan al momento del cálculo; no existe historial de transiciones por etapa.'
      ) as payload
    )
    select jsonb_build_object(
      'dataStatus', case when (select received + started + confirmed from raw_metrics) = 0 then 'empty' else 'ready' end,
      'metrics', jsonb_build_object(
        'agentServedConversations', (select served from raw_metrics),
        'purchaseIntentConversations', (select intent from raw_metrics),
        'agentConfirmedOrders', (select confirmed from raw_metrics),
        'closeRatePercent', case when (select intent from raw_metrics) > 0 then round(100.0 * (select confirmed from raw_metrics) / (select intent from raw_metrics), 1) else null end,
        'humanInterventionConversations', (select intervention_conversations from raw_metrics),
        'averageFirstResponseMinutes', round(coalesce((select average_first_response_minutes from raw_metrics), 0)::numeric, 2),
        'averageCompletionMinutes', round(coalesce((select average_completion_minutes from raw_metrics), 0)::numeric, 2),
        'totalValue', round((select total_value from raw_metrics), 2),
        'averageTicket', round((select average_ticket from raw_metrics), 2),
        'manualCorrections', (select correction_orders from quality),
        'manualCorrectionRatePercent', case when (select confirmed_orders from quality) > 0 then round(100.0 * (select correction_orders from quality) / (select confirmed_orders from quality), 1) else null end
      ),
      'funnel', jsonb_build_object(
        'items', jsonb_build_array(
          jsonb_build_object('key', 'received', 'label', 'Conversaciones recibidas', 'value', (select received from raw_metrics)),
          jsonb_build_object('key', 'served', 'label', 'Atendidas por el agente', 'value', (select served from raw_metrics)),
          jsonb_build_object('key', 'intent', 'label', 'Con intención de compra', 'value', (select intent from raw_metrics)),
          jsonb_build_object('key', 'started', 'label', 'Pedido iniciado', 'value', (select started from raw_metrics)),
          jsonb_build_object('key', 'confirmed', 'label', 'Pedido confirmado por el agente', 'value', (select confirmed from raw_metrics)),
          jsonb_build_object('key', 'completed', 'label', 'Pedido completado', 'value', (select completed from raw_metrics))
        ),
        'losses', jsonb_build_object(
          'withoutAgentResponse', greatest((select received - served from raw_metrics), 0),
          'withoutPurchaseIntent', greatest((select served - intent from raw_metrics), 0),
          'withoutConfirmation', greatest((select intent - confirmed from raw_metrics), 0)
        )
      ),
      'timing', (select payload from timing),
      'activity', jsonb_build_object('daily', (select daily from activity), 'hourly', (select hourly from activity)),
      'abandonment', (select payload from abandonment),
      'humanIntervention', (select payload from intervention),
      'quality', jsonb_build_object(
        'withoutManualCorrection', greatest((select confirmed_orders - correction_orders from quality), 0),
        'restaurantCorrections', (select correction_orders from quality),
        'unavailableItemEvents', (select unavailable_item_events from quality),
        'cancelledAfterAvailabilityIssue', (select cancelled_after_availability_issue from quality),
        'incompleteOrders', null,
        'duplicateOrders', null
      ),
      'limitations', jsonb_build_array(
        'No hay historial de cambios de estado de conversaciones ni de pedidos; las etapas de abandono se muestran con el estado actual.',
        'No existe una señal estructurada para pedidos incompletos o duplicados; por eso se muestran como sin datos.'
      )
    )
  $query$, p_schema_name)
  into v_payload
  using p_start_at, p_end_at, p_timezone;

  return coalesce(v_payload, '{}'::jsonb);
end;
$$;

create or replace function control.calculate_restaurant_analytics(
  p_tenant_id uuid,
  p_range_start date,
  p_range_end date,
  p_calculated_by uuid default null
)
returns control.restaurant_analytics_snapshots
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant control.tenants%rowtype;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_previous_start_at timestamptz;
  v_previous_end_at timestamptz;
  v_days integer;
  v_payload jsonb;
  v_previous_payload jsonb;
  v_snapshot control.restaurant_analytics_snapshots%rowtype;
begin
  if p_range_end < p_range_start then
    raise exception 'invalid_analytics_range';
  end if;

  select * into v_tenant from control.tenants where id = p_tenant_id;
  if not found then
    raise exception 'restaurant_not_found';
  end if;

  v_days := (p_range_end - p_range_start) + 1;
  v_start_at := p_range_start::timestamp at time zone v_tenant.timezone;
  v_end_at := (p_range_end + 1)::timestamp at time zone v_tenant.timezone;
  v_previous_start_at := (p_range_start - v_days)::timestamp at time zone v_tenant.timezone;
  v_previous_end_at := p_range_start::timestamp at time zone v_tenant.timezone;

  v_payload := control.build_restaurant_analytics_payload(v_tenant.schema_name, v_start_at, v_end_at, v_tenant.timezone);
  v_previous_payload := control.build_restaurant_analytics_payload(v_tenant.schema_name, v_previous_start_at, v_previous_end_at, v_tenant.timezone);

  insert into control.restaurant_analytics_snapshots (
    tenant_id, range_start, range_end, timezone, payload, previous_payload, calculated_by, calculated_at, updated_at
  ) values (
    p_tenant_id, p_range_start, p_range_end, v_tenant.timezone, v_payload, v_previous_payload, p_calculated_by, now(), now()
  )
  on conflict (tenant_id, range_start, range_end) do update
  set timezone = excluded.timezone,
      payload = excluded.payload,
      previous_payload = excluded.previous_payload,
      calculated_by = excluded.calculated_by,
      calculated_at = excluded.calculated_at,
      updated_at = now()
  returning * into v_snapshot;

  return v_snapshot;
end;
$$;

revoke all on function control.build_restaurant_analytics_payload(text, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function control.calculate_restaurant_analytics(uuid, date, date, uuid) from public, anon, authenticated;
grant execute on function control.calculate_restaurant_analytics(uuid, date, date, uuid) to service_role;

notify pgrst, 'reload schema';
