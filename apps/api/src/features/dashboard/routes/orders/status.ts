import type { Hono } from "hono";
import type { OrderStatus } from "@42day/types";
import { createSupabaseRestClient } from "../../../../lib/supabase-rest";
import type { ApiBindings } from "../../../../lib/bindings";
import { isMissingTableError } from "../../../../shared/errors/supabase";
import { mapOrderSummary } from "../../support/orders";
import type { CustomerRow, DashboardVariables, OrderRow } from "../../types";
import { CUSTOMER_SELECT } from "./contracts";

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

    const [customer] = await createSupabaseRestClient(c.env).select<CustomerRow>({
      schema: tenant.schema_name,
      table: "customers",
      query: {
        select: CUSTOMER_SELECT,
        id: `eq.${order.customer_id}`,
        limit: 1,
      },
    });

    return c.json(mapOrderSummary(order, customer));
  });
}
