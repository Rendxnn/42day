create or replace function control.configure_tenant_semantic_draft_operation_plan(p_schema_name text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = p_schema_name and table_name = 'draft_orders'
  ) then
    return;
  end if;

  execute format($function$
    create or replace function %1$I.apply_semantic_draft_operation_plan(
      p_conversation_id uuid,
      p_customer_id uuid,
      p_location_id uuid,
      p_expected_conversation_updated_at timestamptz,
      p_draft_order_id uuid,
      p_expected_draft_updated_at timestamptz,
      p_items jsonb,
      p_patch jsonb,
      p_billing jsonb,
      p_next_state text,
      p_context jsonb
    ) returns jsonb
    language plpgsql
    security invoker
    set search_path = %1$I, pg_catalog
    as $rpc$
    declare
      current_conversation %1$I.conversations%%rowtype;
      current_draft %1$I.draft_orders%%rowtype;
      next_billing_profile_id uuid;
      customer_address_id uuid;
      line jsonb;
      invalid_item_count integer;
      next_subtotal integer := 0;
      next_delivery_fee integer := 0;
      next_total integer := 0;
      changed_at timestamptz := now();
    begin
      if jsonb_typeof(p_items) <> 'array' then
        raise exception 'semantic_plan_items_invalid';
      end if;
      if p_next_state not in (
        'awaiting_guided_item_selection', 'awaiting_more_items', 'awaiting_fulfillment_type', 'awaiting_address',
        'awaiting_billing_reuse_confirmation', 'awaiting_normal_billing_info',
        'awaiting_electronic_billing_info', 'awaiting_payment_method', 'awaiting_confirmation'
      ) then
        raise exception 'semantic_plan_next_state_invalid';
      end if;

      select * into current_conversation
      from %1$I.conversations
      where id = p_conversation_id
      for update;
      if not found then raise exception 'conversation_not_found'; end if;
      if current_conversation.state in ('completed', 'expired', 'manual') then
        raise exception 'conversation_terminal_or_manual';
      end if;
      if current_conversation.updated_at <> p_expected_conversation_updated_at then
        raise exception 'conversation_stale';
      end if;

      if p_draft_order_id is not null then
        if current_conversation.current_draft_order_id is not null
          and current_conversation.current_draft_order_id <> p_draft_order_id then
          raise exception 'draft_order_not_current_for_conversation';
        end if;
        select * into current_draft
        from %1$I.draft_orders
        where id = p_draft_order_id and conversation_id = p_conversation_id
        for update;
        if not found then raise exception 'draft_order_not_found'; end if;
        if p_expected_draft_updated_at is not null and current_draft.updated_at <> p_expected_draft_updated_at then
          raise exception 'draft_order_stale';
        end if;
      else
        insert into %1$I.draft_orders (
          conversation_id, customer_id, location_id, status, service_timing,
          subtotal, delivery_fee, discount_total, total
        ) values (
          p_conversation_id, p_customer_id, p_location_id, 'draft', 'asap', 0, 0, 0, 0
        ) returning * into current_draft;
        update %1$I.conversations
        set current_draft_order_id = current_draft.id
        where id = p_conversation_id;
      end if;

      select count(*) into invalid_item_count
      from jsonb_array_elements(p_items) candidate
      left join %1$I.menu_items mi on mi.id = nullif(candidate.value ->> 'menuItemId', '')::uuid
      left join %1$I.products p on p.id = mi.product_id
      where nullif(candidate.value ->> 'menuItemId', '') is null
        or mi.id is null
        or mi.is_available is not true
        or (mi.product_id is not null and coalesce(p.is_active, false) is not true)
        or coalesce((candidate.value ->> 'quantity')::integer, 0) < 1
        or coalesce((candidate.value ->> 'unitPrice')::integer, -1) < 0
        or coalesce((candidate.value ->> 'lineTotal')::integer, -1) < 0;
      if invalid_item_count > 0 then raise exception 'semantic_plan_contains_invalid_or_unavailable_item'; end if;

      if p_billing is not null and jsonb_typeof(p_billing) = 'object' then
        insert into %1$I.customer_billing_profiles (
          customer_id, billing_type, full_name, billing_address, legal_name, tax_id, email, updated_at
        ) values (
          p_customer_id,
          p_billing ->> 'type',
          nullif(p_billing ->> 'fullName', ''),
          nullif(p_billing ->> 'billingAddress', ''),
          nullif(p_billing ->> 'legalName', ''),
          nullif(p_billing ->> 'taxId', ''),
          nullif(p_billing ->> 'email', ''),
          changed_at
        )
        on conflict (customer_id, billing_type) do update set
          full_name = excluded.full_name,
          billing_address = excluded.billing_address,
          legal_name = excluded.legal_name,
          tax_id = excluded.tax_id,
          email = excluded.email,
          updated_at = changed_at
        returning id into next_billing_profile_id;
      end if;

      if p_patch ? 'customerAddressText' then
        update %1$I.customer_addresses
        set is_default = false, updated_at = changed_at
        where customer_id = p_customer_id and is_default is true;
        insert into %1$I.customer_addresses (
          customer_id, label, address_text, address_details, latitude, longitude, source, is_default, updated_at
        ) values (
          p_customer_id, 'Direccion de entrega', nullif(p_patch ->> 'customerAddressText', ''),
          nullif(p_patch ->> 'deliveryAddressDetails', ''),
          nullif(p_patch ->> 'customerLatitude', '')::numeric,
          nullif(p_patch ->> 'customerLongitude', '')::numeric,
          'text', true, changed_at
        ) returning id into customer_address_id;
        update %1$I.customers set default_address = nullif(p_patch ->> 'customerAddressText', ''), updated_at = changed_at where id = p_customer_id;
      end if;

      delete from %1$I.draft_order_items where draft_order_id = current_draft.id;
      for line in select value from jsonb_array_elements(p_items) loop
        insert into %1$I.draft_order_items (
          draft_order_id, menu_item_id, product_id, combo_id, name_snapshot,
          quantity, unit_price, options_snapshot, notes, line_total
        ) values (
          current_draft.id,
          (line ->> 'menuItemId')::uuid,
          nullif(line ->> 'productId', '')::uuid,
          nullif(line ->> 'comboId', '')::uuid,
          line ->> 'name',
          (line ->> 'quantity')::integer,
          (line ->> 'unitPrice')::integer,
          line -> 'options',
          nullif(line ->> 'notes', ''),
          (line ->> 'lineTotal')::integer
        );
      end loop;

      select coalesce(sum(line_total), 0) into next_subtotal
      from %1$I.draft_order_items where draft_order_id = current_draft.id;
      if coalesce(p_patch ->> 'fulfillmentType', current_draft.fulfillment_type) = 'delivery' then
        select coalesce(delivery_fee_fixed, 0) into next_delivery_fee
        from %1$I.locations where id = coalesce(current_draft.location_id, p_location_id);
      end if;
      next_total := next_subtotal + next_delivery_fee - current_draft.discount_total;

      update %1$I.draft_orders set
        fulfillment_type = coalesce(p_patch ->> 'fulfillmentType', fulfillment_type),
        payment_method = coalesce(p_patch ->> 'paymentMethod', payment_method),
        delivery_address = case when coalesce(p_patch ->> 'fulfillmentType', fulfillment_type) = 'pickup' then null when p_patch ? 'deliveryAddress' then nullif(p_patch ->> 'deliveryAddress', '') else delivery_address end,
        delivery_address_id = case when coalesce(p_patch ->> 'fulfillmentType', fulfillment_type) = 'pickup' then null when customer_address_id is not null then customer_address_id else delivery_address_id end,
        delivery_address_details = case when coalesce(p_patch ->> 'fulfillmentType', fulfillment_type) = 'pickup' then null when p_patch ? 'deliveryAddressDetails' then nullif(p_patch ->> 'deliveryAddressDetails', '') else delivery_address_details end,
        customer_address_text = case when coalesce(p_patch ->> 'fulfillmentType', fulfillment_type) = 'pickup' then null when p_patch ? 'customerAddressText' then nullif(p_patch ->> 'customerAddressText', '') else customer_address_text end,
        resolved_delivery_address = case when coalesce(p_patch ->> 'fulfillmentType', fulfillment_type) = 'pickup' then null when p_patch ? 'resolvedDeliveryAddress' then nullif(p_patch ->> 'resolvedDeliveryAddress', '') else resolved_delivery_address end,
        customer_latitude = case when p_patch ? 'customerLatitude' then nullif(p_patch ->> 'customerLatitude', '')::numeric else customer_latitude end,
        customer_longitude = case when p_patch ? 'customerLongitude' then nullif(p_patch ->> 'customerLongitude', '')::numeric else customer_longitude end,
        delivery_distance_km = case when p_patch ? 'deliveryDistanceKm' then nullif(p_patch ->> 'deliveryDistanceKm', '')::numeric else delivery_distance_km end,
        is_inside_delivery_coverage = case when p_patch ? 'isInsideDeliveryCoverage' then (p_patch ->> 'isInsideDeliveryCoverage')::boolean else is_inside_delivery_coverage end,
        coverage_validation_method = case when p_patch ? 'coverageValidationMethod' then nullif(p_patch ->> 'coverageValidationMethod', '') else coverage_validation_method end,
        coverage_confidence = case when p_patch ? 'coverageConfidence' then nullif(p_patch ->> 'coverageConfidence', '') else coverage_confidence end,
        coverage_checked_at = case when p_patch ? 'coverageCheckedAt' then nullif(p_patch ->> 'coverageCheckedAt', '')::timestamptz else coverage_checked_at end,
        billing_type = case when p_billing is null then billing_type else p_billing ->> 'type' end,
        billing_profile_id = coalesce(next_billing_profile_id, current_draft.billing_profile_id),
        billing_full_name = case when p_billing is null then billing_full_name else nullif(p_billing ->> 'fullName', '') end,
        billing_address = case when p_billing is null then billing_address else nullif(p_billing ->> 'billingAddress', '') end,
        billing_legal_name = case when p_billing is null then billing_legal_name else nullif(p_billing ->> 'legalName', '') end,
        billing_tax_id = case when p_billing is null then billing_tax_id else nullif(p_billing ->> 'taxId', '') end,
        billing_email = case when p_billing is null then billing_email else nullif(p_billing ->> 'email', '') end,
        subtotal = next_subtotal,
        delivery_fee = next_delivery_fee,
        total = next_total,
        status = case
          when p_next_state = 'awaiting_confirmation' then 'ready_for_confirmation'
          when next_subtotal > 0 then 'needs_clarification'
          else 'draft'
        end,
        updated_at = changed_at
      where id = current_draft.id
      returning * into current_draft;

      update %1$I.conversations set
        state = p_next_state,
        context = coalesce(p_context, '{}'::jsonb),
        clarification_attempts = 0,
        updated_at = changed_at
      where id = p_conversation_id
      returning * into current_conversation;

      insert into %1$I.app_events (conversation_id, draft_order_id, event_name, severity, source, metadata)
      values (p_conversation_id, current_draft.id, 'semantic_draft_operation.applied', 'info', 'message_router', jsonb_build_object('itemCount', jsonb_array_length(p_items), 'nextState', p_next_state));

      return jsonb_build_object('draftId', current_draft.id, 'conversationId', current_conversation.id);
    end;
    $rpc$;
  $function$, p_schema_name);
  execute format('revoke all on function %I.apply_semantic_draft_operation_plan(uuid, uuid, uuid, timestamptz, uuid, timestamptz, jsonb, jsonb, jsonb, text, jsonb) from public, anon, authenticated', p_schema_name);
  execute format('grant execute on function %I.apply_semantic_draft_operation_plan(uuid, uuid, uuid, timestamptz, uuid, timestamptz, jsonb, jsonb, jsonb, text, jsonb) to service_role', p_schema_name);
end;
$$;
revoke all on function control.configure_tenant_semantic_draft_operation_plan(text) from public, anon, authenticated;
grant execute on function control.configure_tenant_semantic_draft_operation_plan(text) to service_role;
do $$
declare tenant_record record;
begin
  perform control.configure_tenant_semantic_draft_operation_plan('tenant_template');
  for tenant_record in select schema_name from control.tenants where schema_name like 'tenant_%' loop
    perform control.configure_tenant_semantic_draft_operation_plan(tenant_record.schema_name);
  end loop;
end;
$$;
create or replace function control.configure_new_tenant_semantic_draft_operation_plan()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$ begin perform control.configure_tenant_semantic_draft_operation_plan(new.schema_name); return new; end; $$;
revoke all on function control.configure_new_tenant_semantic_draft_operation_plan() from public, anon, authenticated;
drop trigger if exists configure_new_tenant_semantic_draft_operation_plan on control.tenants;
create constraint trigger configure_new_tenant_semantic_draft_operation_plan
after insert on control.tenants deferrable initially deferred
for each row execute function control.configure_new_tenant_semantic_draft_operation_plan();
notify pgrst, 'reload schema';
