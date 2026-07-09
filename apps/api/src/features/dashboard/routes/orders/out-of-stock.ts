import type { Hono } from "hono";
import type { RejectOutOfStockOrderRequest } from "@42day/types";
import { createSupabaseRestClient } from "../../../../lib/supabase-rest";
import type { ApiBindings } from "../../../../lib/bindings";
import { updateConversationState } from "../../../../modules/conversation-service/conversation-service";
import { getTenantUserRole } from "../../auth";
import { loadOrderNotificationContext, mapOrderSummary, resolvePendingConfirmationAlerts, resolveReplacementOptions } from "../../support/orders";
import { buildOutOfStockMessage, sendOrderCustomerNotification } from "../../support/notifications";
import type { DashboardVariables, OrderItemRow, OrderRow } from "../../types";
import { ORDER_ITEM_SELECT } from "./contracts";

export function registerOrdersOutOfStockRoute(routes: Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>) {
  routes.post("/:tenantSlug/orders/:orderId/reject-out-of-stock", async (c) => {
    const tenant = c.get("tenant");
    const authUser = c.get("authUser");
    const role = await getTenantUserRole(c.env, authUser.id, tenant.id);

    if (!role) {
      return c.json({ error: "forbidden" }, 403);
    }

    const body = await c.req.json<RejectOutOfStockOrderRequest>().catch(() => undefined);

    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      return c.json({ error: "invalid_out_of_stock_request" }, 400);
    }

    const context = await loadOrderNotificationContext(c.env, tenant.schema_name, c.req.param("orderId"));

    if (!context) {
      return c.json({ error: "order_not_found" }, 404);
    }

    if (context.order.status !== "pending_restaurant_confirmation") {
      return c.json({ error: "order_not_pending_restaurant_confirmation" }, 409);
    }

    const unavailableSelection = body.items[0];
    if (!unavailableSelection) {
      return c.json({ error: "invalid_out_of_stock_request" }, 400);
    }
    const orderItems = await createSupabaseRestClient(c.env).select<OrderItemRow>({
      schema: tenant.schema_name,
      table: "order_items",
      query: {
        select: ORDER_ITEM_SELECT,
        order_id: `eq.${context.order.id}`,
      },
    });
    const unavailableItem = orderItems.find((item) => item.id === unavailableSelection.orderItemId);

    if (!unavailableItem) {
      return c.json({ error: "order_item_not_found" }, 404);
    }

    const replacementOptions = await resolveReplacementOptions({
      env: c.env,
      schemaName: tenant.schema_name,
      tenantTimezone: tenant.timezone,
      orderItem: unavailableItem,
      requestedReplacementMenuItemIds: unavailableSelection.replacementMenuItemIds ?? [],
    });

    if (replacementOptions.length === 0) {
      return c.json({ error: "replacement_options_not_found" }, 409);
    }

    if (unavailableSelection.markMenuItemUnavailable && unavailableItem.menu_item_id) {
      await createSupabaseRestClient(c.env).update({
        schema: tenant.schema_name,
        table: "menu_items",
        values: {
          is_available: false,
        },
        query: {
          id: `eq.${unavailableItem.menu_item_id}`,
        },
      }).catch(() => undefined);

      await createSupabaseRestClient(c.env).insert({
        schema: tenant.schema_name,
        table: "app_events",
        rows: {
          conversation_id: context.draftOrder?.conversation_id ?? null,
          draft_order_id: context.order.draft_order_id ?? null,
          order_id: context.order.id,
          event_name: "menu_item.marked_unavailable_from_order",
          severity: "info",
          source: "dashboard_api",
          metadata: {
            orderItemId: unavailableItem.id,
            menuItemId: unavailableItem.menu_item_id,
            reviewedBy: authUser.id,
          },
        },
      }).catch(() => undefined);
    }

    const reviewMetadata = {
      reason: "out_of_stock",
      unavailableOrderItemIds: [unavailableItem.id],
      unavailableItems: [
        {
          orderItemId: unavailableItem.id,
          menuItemId: unavailableItem.menu_item_id ?? undefined,
          productId: unavailableItem.product_id ?? undefined,
          comboId: unavailableItem.combo_id ?? undefined,
          name: unavailableItem.name_snapshot,
          quantity: unavailableItem.quantity,
          category: unavailableItem.category_snapshot ?? undefined,
        },
      ],
      replacementMenuItems: replacementOptions,
      markMenuItemsUnavailable: Boolean(unavailableSelection.markMenuItemUnavailable),
    };

    const now = new Date().toISOString();
    const [updated] = await createSupabaseRestClient(c.env).updateReturning<OrderRow>({
      schema: tenant.schema_name,
      table: "orders",
      query: { id: `eq.${context.order.id}` },
      patch: {
        status: "needs_customer_replacement",
        restaurant_reviewed_at: now,
        restaurant_reviewed_by: authUser.id,
        restaurant_review_note: body.note ?? null,
        restaurant_review_metadata: reviewMetadata,
        customer_notification_status: "pending",
        customer_notification_error: null,
        updated_at: now,
      },
    });

    if (context.draftOrder?.conversation_id) {
      await updateConversationState({
        env: c.env,
        schemaName: tenant.schema_name,
        conversationId: context.draftOrder.conversation_id,
        state: "awaiting_replacement_selection",
        resetClarificationAttempts: true,
      }).catch(() => undefined);
    }

    await createSupabaseRestClient(c.env).insert({
      schema: tenant.schema_name,
      table: "app_events",
      rows: {
        conversation_id: context.draftOrder?.conversation_id ?? null,
        draft_order_id: context.order.draft_order_id ?? null,
        order_id: context.order.id,
        event_name: "order.out_of_stock_returned_to_customer",
        severity: "info",
        source: "dashboard_api",
        metadata: {
          reviewedBy: authUser.id,
          note: body.note ?? null,
          reviewMetadata,
        },
      },
    }).catch(() => undefined);

    await resolvePendingConfirmationAlerts(c.env, tenant.schema_name, context.order.id).catch(() => undefined);

    const notificationText = buildOutOfStockMessage(unavailableItem.name_snapshot, replacementOptions);
    const finalOrder = await sendOrderCustomerNotification({
      env: c.env,
      schemaName: tenant.schema_name,
      context: {
        ...context,
        order: updated ?? context.order,
      },
      notification: {
        kind: "text",
        text: notificationText,
      },
      notificationType: "out_of_stock",
    });

    return c.json(mapOrderSummary(finalOrder, context.customer));
  });
}
