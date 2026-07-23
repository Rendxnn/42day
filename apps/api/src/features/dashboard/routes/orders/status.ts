import type { Hono } from "hono";
import type { OrderStatus } from "@42day/types";
import { createSupabaseRestClient } from "../../../../lib/supabase-rest";
import type { ApiBindings } from "../../../../lib/bindings";
import { isMissingTableError } from "../../../../shared/errors/supabase";
import { completeConversationAfterTerminalOrder } from "../../../../modules/conversation-service/conversation-service";
import { loadOrderNotificationContext, mapOrderSummary } from "../../support/orders";
import { buildOrderStatusNotification, sendOrderCustomerNotification } from "../../support/notifications";
import type { DashboardVariables, OrderRow } from "../../types";

export function registerOrdersStatusRoute(routes: Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>) {
  routes.patch("/:tenantSlug/orders/:orderId/status", async (c) => {
    const tenant = c.get("tenant");
    const body = await c.req.json<{
      status?: OrderStatus;
      restaurantConfirmed?: boolean;
      paymentConfirmed?: boolean;
    }>();
    const currentContext = await loadOrderNotificationContext(c.env, tenant.schema_name, c.req.param("orderId"));
    if (!currentContext) {
      return c.json({ error: "order_not_found" }, 404);
    }

    if (body.status && body.status !== currentContext.order.status) {
      const transitionError = validateOrderStatusTransition(currentContext.order, body.status);
      if (transitionError) {
        return c.json({ error: transitionError }, 409);
      }
    }
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      updated_at: now,
    };

    if (body.status !== undefined) {
      patch.status = body.status;
    }

    if (body.restaurantConfirmed === true) {
      patch.restaurant_confirmed_at = now;
    }

    if (body.restaurantConfirmed === false) {
      patch.restaurant_confirmed_at = null;
    }

    if (body.paymentConfirmed === true) {
      patch.payment_confirmed_at = now;
    }

    if (body.paymentConfirmed === false) {
      patch.payment_confirmed_at = null;
    }

    let order: OrderRow | undefined;

    try {
      [order] = await createSupabaseRestClient(c.env).updateReturning<OrderRow>({
        schema: tenant.schema_name,
        table: "orders",
        query: { id: `eq.${c.req.param("orderId")}` },
        patch,
      });
    } catch (error) {
      if (isMissingTableError(error)) {
        return c.json({ error: "order_module_unavailable" }, 404);
      }

      throw error;
    }

    if (!order) {
      return c.json({ error: "order_not_found" }, 404);
    }

    if (body.status === "cancelled") {
      if (currentContext.draftOrder?.id) {
        await createSupabaseRestClient(c.env).update({
          schema: tenant.schema_name,
          table: "draft_orders",
          values: { status: "cancelled", updated_at: now },
          query: { id: `eq.${currentContext.draftOrder.id}` },
        });
      }
    }

    if (
      (body.status === "cancelled" || body.status === "delivered")
      && currentContext.draftOrder?.conversation_id
    ) {
      await completeConversationAfterTerminalOrder({
        env: c.env,
        schemaName: tenant.schema_name,
        conversationId: currentContext.draftOrder.conversation_id,
        reason: body.status === "cancelled" ? "order_cancelled" : "order_delivered",
      });
    }

    const notification = body.status && body.status !== currentContext.order.status
      ? buildOrderStatusNotification(order)
      : null;
    const finalOrder = notification
      ? await sendOrderCustomerNotification({
          env: c.env,
          schemaName: tenant.schema_name,
          context: { ...currentContext, order },
          notification: { kind: "text", text: notification },
          notificationType: "order_status",
        })
      : order;

    return c.json(mapOrderSummary(finalOrder, currentContext.customer));
  });
}

function validateOrderStatusTransition(
  order: OrderRow,
  nextStatus: OrderStatus,
): string | null {
  if (nextStatus === "cancelled") {
    return ["delivered", "cancelled"].includes(order.status) ? "order_already_terminal" : null;
  }

  if (nextStatus === "preparing") {
    return order.status === "accepted" ? null : "invalid_order_status_transition";
  }

  if (nextStatus === "on_the_way") {
    if (!["accepted", "preparing"].includes(order.status)) {
      return "invalid_order_status_transition";
    }
    if (order.payment_method === "transfer" && !order.payment_confirmed_at) {
      return "order_payment_not_confirmed";
    }
    if ((order.kitchen_progress ?? 0) !== 100) {
      return "order_kitchen_not_completed";
    }
    return null;
  }

  if (nextStatus === "delivered") {
    return order.status === "on_the_way" ? null : "invalid_order_status_transition";
  }

  return "use_required_order_action";
}
