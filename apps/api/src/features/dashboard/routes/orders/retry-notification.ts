import type { Hono } from "hono";
import type { RetryOrderCustomerNotificationRequest } from "@42day/types";
import type { ApiBindings } from "../../../../lib/bindings";
import { getTenantUserRole } from "../../auth";
import { buildAcceptedOrderNotification } from "../../order-customer-notifications";
import { loadOrderNotificationContext, mapOrderSummary } from "../../support/orders";
import { buildRetryNotificationMessage, sendOrderCustomerNotification } from "../../support/notifications";
import type { DashboardVariables } from "../../types";

export function registerOrdersRetryNotificationRoute(routes: Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>) {
  routes.post("/:tenantSlug/orders/:orderId/customer-notification/retry", async (c) => {
    const tenant = c.get("tenant");
    const authUser = c.get("authUser");
    const role = await getTenantUserRole(c.env, authUser.id, tenant.id);

    if (!role) {
      return c.json({ error: "forbidden" }, 403);
    }

    const body = await c.req.json<RetryOrderCustomerNotificationRequest>().catch(() => undefined);

    if (!body?.type) {
      return c.json({ error: "invalid_customer_notification_retry_request" }, 400);
    }

    const context = await loadOrderNotificationContext(c.env, tenant.schema_name, c.req.param("orderId"));

    if (!context) {
      return c.json({ error: "order_not_found" }, 404);
    }

    const notification = body.type === "accepted"
      ? await buildAcceptedOrderNotification({
          env: c.env,
          tenant,
          order: context.order,
        }).then((result) => result.notification)
      : (() => {
          const text = buildRetryNotificationMessage(body.type, context.order, context.location);
          return text ? { kind: "text" as const, text } : null;
        })();

    if (!notification) {
      return c.json({ error: "customer_notification_retry_not_available" }, 409);
    }

    const finalOrder = await sendOrderCustomerNotification({
      env: c.env,
      schemaName: tenant.schema_name,
      context,
      notification,
      notificationType: body.type,
    });

    return c.json(mapOrderSummary(finalOrder, context.customer));
  });
}
