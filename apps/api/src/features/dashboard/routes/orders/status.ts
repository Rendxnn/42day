import type { Hono } from "hono";
import type { OrderStatus } from "@42day/types";
import { createSupabaseRestClient } from "../../../../lib/supabase-rest";
import type { ApiBindings } from "../../../../lib/bindings";
import { isMissingTableError } from "../../../../shared/errors/supabase";
import { completeConversationAfterOrderCancellation } from "../../../../modules/conversation-service/conversation-service";
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
      const resetTasks: Promise<unknown>[] = [];

      if (currentContext.draftOrder?.id) {
        resetTasks.push(
          createSupabaseRestClient(c.env).update({
            schema: tenant.schema_name,
            table: "draft_orders",
            values: { status: "cancelled", updated_at: now },
            query: { id: `eq.${currentContext.draftOrder.id}` },
          }),
        );
      }

      if (currentContext.draftOrder?.conversation_id) {
        resetTasks.push(
          completeConversationAfterOrderCancellation({
            env: c.env,
            schemaName: tenant.schema_name,
            conversationId: currentContext.draftOrder.conversation_id,
          }),
        );
      }

      await Promise.all(resetTasks);
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
