create or replace function control.configure_tenant_order_adjustment(p_schema_name text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = p_schema_name and table_name = 'orders') then
    return;
  end if;

  execute format($function$
    create or replace function %1$I.confirm_order_adjustment(
      p_conversation_id uuid,
      p_order_id uuid,
      p_expected_order_updated_at timestamptz
    ) returns jsonb
    language plpgsql
    security invoker
    set search_path = %1$I, pg_catalog
    as $rpc$
    declare
      current_order %1$I.orders%%rowtype;
      current_draft %1$I.draft_orders%%rowtype;
      current_conversation %1$I.conversations%%rowtype;
      invalid_item_count integer;
      next_subtotal integer;
      next_total integer;
      changed_at timestamptz := now();
    begin
      select * into current_order from %1$I.orders where id = p_order_id for update;
      if not found then raise exception 'order_not_found'; end if;
      if current_order.status <> 'needs_customer_replacement' then raise exception 'order_not_awaiting_adjustment'; end if;
      if current_order.updated_at <> p_expected_order_updated_at then raise exception 'order_stale'; end if;

      select * into current_conversation from %1$I.conversations where id = p_conversation_id for update;
      if not found then raise exception 'conversation_not_found'; end if;
      if current_conversation.state not in ('awaiting_confirmation', 'awaiting_order_adjustment') then raise exception 'conversation_not_awaiting_adjustment_confirmation'; end if;

      select * into current_draft from %1$I.draft_orders where id = current_order.draft_order_id for update;
      if not found then raise exception 'adjustment_draft_not_found'; end if;

      select count(*) into invalid_item_count
      from %1$I.draft_order_items doi
      left join %1$I.menu_items mi on mi.id = doi.menu_item_id
      left join %1$I.products p on p.id = doi.product_id
      where doi.draft_order_id = current_draft.id
        and (doi.menu_item_id is null or mi.id is null or mi.is_available is not true or (doi.product_id is not null and coalesce(p.is_active, false) is not true));
      if invalid_item_count > 0 then raise exception 'adjustment_contains_unavailable_item'; end if;

      select coalesce(sum(line_total), 0) into next_subtotal from %1$I.draft_order_items where draft_order_id = current_draft.id;
      if next_subtotal <= 0 then raise exception 'adjustment_has_no_items'; end if;
      next_total := next_subtotal + current_draft.delivery_fee - current_draft.discount_total;

      update %1$I.draft_orders set subtotal = next_subtotal, total = next_total, status = 'confirmed', updated_at = changed_at where id = current_draft.id;
      delete from %1$I.order_items where order_id = current_order.id;
      insert into %1$I.order_items (order_id, menu_item_id, product_id, combo_id, category_snapshot, name_snapshot, quantity, unit_price, options_snapshot, notes, line_total)
      select current_order.id, doi.menu_item_id, doi.product_id, doi.combo_id, p.category, doi.name_snapshot, doi.quantity, doi.unit_price, doi.options_snapshot, doi.notes, doi.line_total
      from %1$I.draft_order_items doi
      left join %1$I.products p on p.id = doi.product_id
      where doi.draft_order_id = current_draft.id;

      update %1$I.orders
      set status = 'pending_restaurant_confirmation', subtotal = next_subtotal, total = next_total,
          restaurant_review_metadata = coalesce(restaurant_review_metadata, '{}'::jsonb) || jsonb_build_object('adjustmentStatus', 'confirmed', 'customerAdjustmentConfirmedAt', changed_at),
          customer_notification_status = 'pending', customer_notification_error = null, updated_at = changed_at
      where id = current_order.id
      returning * into current_order;

      update %1$I.conversations set state = 'awaiting_restaurant_confirmation', clarification_attempts = 0, updated_at = changed_at where id = p_conversation_id;
      update %1$I.human_intervention_alerts set status = 'resolved', resolved_at = changed_at
      where order_id = current_order.id and status in ('open', 'acknowledged') and type in ('order_change_requested', 'order_pending_confirmation');
      insert into %1$I.human_intervention_alerts (conversation_id, draft_order_id, order_id, type, title, description, status)
      values (p_conversation_id, current_draft.id, current_order.id, 'order_pending_confirmation', 'Pedido ajustado pendiente por confirmar', 'El cliente confirmo el ajuste por productos agotados.', 'open');
      insert into %1$I.app_events (conversation_id, draft_order_id, order_id, event_name, severity, source, metadata)
      values (p_conversation_id, current_draft.id, current_order.id, 'order.customer_adjustment_confirmed', 'info', 'message_router', jsonb_build_object('subtotal', next_subtotal, 'total', next_total));
      return to_jsonb(current_order);
    end;
    $rpc$;
  $function$, p_schema_name);
  execute format('revoke all on function %I.confirm_order_adjustment(uuid, uuid, timestamptz) from public, anon, authenticated', p_schema_name);
  execute format('grant execute on function %I.confirm_order_adjustment(uuid, uuid, timestamptz) to service_role', p_schema_name);
end;
$$;

revoke all on function control.configure_tenant_order_adjustment(text) from public, anon, authenticated;
grant execute on function control.configure_tenant_order_adjustment(text) to service_role;

do $$
declare tenant_record record;
begin
  perform control.configure_tenant_order_adjustment('tenant_template');
  for tenant_record in select schema_name from control.tenants where schema_name like 'tenant_%' loop
    perform control.configure_tenant_order_adjustment(tenant_record.schema_name);
  end loop;
end;
$$;

create or replace function control.configure_new_tenant_order_adjustment()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$ begin perform control.configure_tenant_order_adjustment(new.schema_name); return new; end; $$;
revoke all on function control.configure_new_tenant_order_adjustment() from public, anon, authenticated;

drop trigger if exists configure_new_tenant_order_adjustment on control.tenants;
create constraint trigger configure_new_tenant_order_adjustment
after insert on control.tenants deferrable initially deferred
for each row execute function control.configure_new_tenant_order_adjustment();

notify pgrst, 'reload schema';
