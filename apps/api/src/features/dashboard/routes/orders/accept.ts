import type { Hono } from "hono";
import type { AcceptOrderRequest } from "@42day/types";
import { createSupabaseRestClient } from "../../../../lib/supabase-rest";
import type { ApiBindings } from "../../../../lib/bindings";
import { updateConversationState } from "../../../../modules/conversation-service/conversation-service";
import { getTenantUserRole } from "../../auth";
import { buildAcceptedOrderNotification } from "../../order-customer-notifications";
import { loadOrderNotificationContext, mapOrderSummary, resolvePendingConfirmationAlerts } from "../../support/orders";
import { sendOrderCustomerNotification } from "../../support/notifications";
import type { DashboardVariables, OrderRow } from "../../types";

export function registerOrdersAcceptRoute(routes: Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>) {
  routes.post("/:tenantSlug/orders/:orderId/accept", async (c) => {
    const tenant = c.get("tenant");
    const authUser = c.get("authUser");
    const role = await getTenantUserRole(c.env, authUser.id, tenant.id);

    if (!role) {
      return c.json({ error: "forbidden" }, 403);
    }

    const body = (await c.req.json().catch(() => ({}))) as AcceptOrderRequest;
    const context = await loadOrderNotificationContext(c.env, tenant.schema_name, c.req.param("orderId"));

    if (!context) {
      return c.json({ error: "order_not_found" }, 404);
    }

    if (context.order.status !== "pending_restaurant_confirmation") {
      return c.json({ error: "order_not_pending_restaurant_confirmation" }, 409);
    }

    const acceptedNotification = await buildAcceptedOrderNotification({
      env: c.env,
      tenant,
      order: context.order,
    });
    const now = new Date().toISOString();
    const status = "accepted" as const;
    const [updated] = await createSupabaseRestClient(c.env).updateReturning<OrderRow>({
      schema: tenant.schema_name,
      table: "orders",
      query: { id: `eq.${context.order.id}` },
      patch: {
        status,
        restaurant_reviewed_at: now,
        restaurant_reviewed_by: authUser.id,
        restaurant_confirmed_at: now,
        restaurant_confirmed_by: authUser.id,
        restaurant_review_note: body.note ?? null,
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
        state: acceptedNotification.conversationState,
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
        event_name: "order.restaurant_accepted",
        severity: "info",
        source: "dashboard_api",
        metadata: {
          reviewedBy: authUser.id,
          note: body.note ?? null,
        },
      },
    }).catch(() => undefined);

    await resolvePendingConfirmationAlerts(c.env, tenant.schema_name, context.order.id).catch(() => undefined);

    const finalOrder = await sendOrderCustomerNotification({
      env: c.env,
      schemaName: tenant.schema_name,
      context: {
        ...context,
        order: updated ?? context.order,
      },
      notification: acceptedNotification.notification,
      notificationType: "accepted",
    });

    return c.json(mapOrderSummary(finalOrder, context.customer));
  });
}
