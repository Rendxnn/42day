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

    const orderItems = await createSupabaseRestClient(c.env).select<OrderItemRow>({
      schema: tenant.schema_name,
      table: "order_items",
      query: {
        select: ORDER_ITEM_SELECT,
        order_id: `eq.${context.order.id}`,
      },
    });
    const selections = body.items.map((selection) => ({ selection, item: orderItems.find((item) => item.id === selection.orderItemId) }));
    if (selections.some(({ item }) => !item)) {
      return c.json({ error: "order_item_not_found" }, 404);
    }

    const unavailableItems = selections.map(({ item }) => item!);
    const replacementOptionsByItem = await Promise.all(selections.map(async ({ selection, item }) => ({
      orderItemId: item!.id,
      options: await resolveReplacementOptions({
        env: c.env,
        schemaName: tenant.schema_name,
        tenantTimezone: tenant.timezone,
        orderItem: item!,
        requestedReplacementMenuItemIds: selection.replacementMenuItemIds ?? [],
      }),
    })));

    for (const { selection, item } of selections) {
      if (selection.markMenuItemUnavailable && item?.menu_item_id) {
        await createSupabaseRestClient(c.env).update({
          schema: tenant.schema_name,
          table: "menu_items",
          values: { is_available: false },
          query: { id: `eq.${item.menu_item_id}` },
        });
      }
    }

    const reviewMetadata = {
      reason: "out_of_stock",
      adjustmentStatus: "awaiting_customer",
      unavailableOrderItemIds: unavailableItems.map((item) => item.id),
      unavailableItems: unavailableItems.map((item) => ({
        orderItemId: item.id,
        menuItemId: item.menu_item_id ?? undefined,
        productId: item.product_id ?? undefined,
        comboId: item.combo_id ?? undefined,
        name: item.name_snapshot,
        quantity: item.quantity,
        category: item.category_snapshot ?? undefined,
      })),
      replacementMenuItemsByUnavailableItem: Object.fromEntries(replacementOptionsByItem.map(({ orderItemId, options }) => [orderItemId, options])),
      markMenuItemsUnavailable: selections.some(({ selection }) => Boolean(selection.markMenuItemUnavailable)),
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
        state: "awaiting_order_adjustment",
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

    const notificationText = buildOutOfStockMessage(unavailableItems.map((item) => ({
      name: item.name_snapshot,
      quantity: item.quantity,
      suggestions: replacementOptionsByItem.find((entry) => entry.orderItemId === item.id)?.options,
    })));
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
