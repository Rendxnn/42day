import type { Hono } from "hono";
import { createSupabaseRestClient } from "../../../../lib/supabase-rest";
import type { ApiBindings } from "../../../../lib/bindings";
import {
  confirmLatestPaymentProofForOrder,
  downloadLatestPaymentProofForOrder,
} from "../../../payment-proofs/service";
import { getTenantUserRole } from "../../auth";
import { mapOrderSummary } from "../../support/orders";
import type { CustomerRow, DashboardVariables, OrderRow } from "../../types";
import { CUSTOMER_SELECT, ORDER_SELECT } from "./contracts";

export function registerOrdersPaymentProofRoutes(routes: Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>) {
  routes.get("/:tenantSlug/orders/:orderId/payment-proof", async (c) => {
    const tenant = c.get("tenant");
    const authUser = c.get("authUser");
    const role = await getTenantUserRole(c.env, authUser.id, tenant.id);

    if (!role) {
      return c.json({ error: "forbidden" }, 403);
    }

    const [order] = await createSupabaseRestClient(c.env).select<OrderRow>({
      schema: tenant.schema_name,
      table: "orders",
      query: {
        select: ORDER_SELECT,
        id: `eq.${c.req.param("orderId")}`,
        limit: 1,
      },
    });

    if (!order) {
      return c.json({ error: "order_not_found" }, 404);
    }

    const paymentProof = await downloadLatestPaymentProofForOrder({
      env: c.env,
      schemaName: tenant.schema_name,
      orderId: order.id,
      paymentProofId: order.payment_proof_file_id ?? undefined,
    }).catch(() => undefined);

    if (!paymentProof) {
      return c.json({ error: "payment_proof_not_found" }, 404);
    }

    return new Response(paymentProof.data, {
      headers: {
        "Content-Type": paymentProof.contentType,
        "Content-Disposition": `inline; filename="${paymentProof.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  });

  routes.post("/:tenantSlug/orders/:orderId/payment-proof/confirm", async (c) => {
    const tenant = c.get("tenant");
    const authUser = c.get("authUser");
    const role = await getTenantUserRole(c.env, authUser.id, tenant.id);

    if (!role) {
      return c.json({ error: "forbidden" }, 403);
    }

    try {
      await confirmLatestPaymentProofForOrder({
        env: c.env,
        schemaName: tenant.schema_name,
        orderId: c.req.param("orderId"),
        reviewedBy: authUser.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message === "payment_proof.order_not_found") {
        return c.json({ error: "order_not_found" }, 404);
      }

      if (message === "payment_proof.not_found") {
        return c.json({ error: "payment_proof_not_found" }, 404);
      }

      if (message === "payment_proof.order_not_pending_review") {
        return c.json({ error: "order_not_pending_payment_review" }, 409);
      }

      throw error;
    }

    const [updatedOrder, customer] = await Promise.all([
      createSupabaseRestClient(c.env).select<OrderRow>({
        schema: tenant.schema_name,
        table: "orders",
        query: {
          select: ORDER_SELECT,
          id: `eq.${c.req.param("orderId")}`,
          limit: 1,
        },
      }),
      createSupabaseRestClient(c.env).select<CustomerRow>({
        schema: tenant.schema_name,
        table: "customers",
        query: {
          select: CUSTOMER_SELECT,
          limit: 500,
        },
      }),
    ]);

    const order = updatedOrder[0];
    if (!order) {
      return c.json({ error: "order_not_found" }, 404);
    }

    const customerById = new Map(customer.map((entry) => [entry.id, entry]));
    return c.json(mapOrderSummary(order, customerById.get(order.customer_id)));
  });
}
