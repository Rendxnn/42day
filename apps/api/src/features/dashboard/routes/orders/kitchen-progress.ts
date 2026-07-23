import type { Hono } from "hono";
import type { KitchenProgress } from "@42day/types";
import { createSupabaseRestClient } from "../../../../lib/supabase-rest";
import type { ApiBindings } from "../../../../lib/bindings";
import { getTenantUserRole } from "../../auth";
import { mapOrderSummary } from "../../support/orders";
import type { DashboardVariables, OrderRow } from "../../types";
import { CUSTOMER_SELECT, ORDER_SELECT } from "./contracts";

const KITCHEN_MILESTONES = new Set<number>([0, 25, 50, 75, 100]);

export function registerOrdersKitchenProgressRoute(routes: Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>) {
  routes.patch("/:tenantSlug/orders/:orderId/kitchen-progress", async (c) => {
    const tenant = c.get("tenant");
    const authUser = c.get("authUser");
    const role = await getTenantUserRole(c.env, authUser.id, tenant.id);

    if (!role) {
      return c.json({ error: "forbidden" }, 403);
    }

    const body = await c.req.json<{
      progress?: number;
      label?: string | null;
    }>().catch(() => undefined);

    if (!body || (body.progress === undefined && body.label === undefined)) {
      return c.json({ error: "kitchen_progress_patch_required" }, 400);
    }

    if (body.progress !== undefined && !KITCHEN_MILESTONES.has(body.progress)) {
      return c.json({ error: "invalid_kitchen_progress" }, 400);
    }

    if (body.label !== undefined && body.label !== null && typeof body.label !== "string") {
      return c.json({ error: "invalid_kitchen_stage_label" }, 400);
    }

    const normalizedLabel = typeof body.label === "string" ? body.label.trim() : body.label;
    if (normalizedLabel && normalizedLabel.length > 60) {
      return c.json({ error: "kitchen_stage_label_too_long" }, 400);
    }

    const client = createSupabaseRestClient(c.env);
    const [current] = await client.select<OrderRow>({
      schema: tenant.schema_name,
      table: "orders",
      query: {
        select: ORDER_SELECT,
        id: `eq.${c.req.param("orderId")}`,
        limit: 1,
      },
    });

    if (!current) {
      return c.json({ error: "order_not_found" }, 404);
    }

    if (!["accepted", "preparing"].includes(current.status)) {
      return c.json({ error: "order_not_in_preparation" }, 409);
    }

    if (current.payment_method === "transfer" && !current.payment_confirmed_at) {
      return c.json({ error: "order_payment_not_confirmed" }, 409);
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      kitchen_progress_updated_at: now,
      kitchen_progress_updated_by: authUser.id,
      updated_at: now,
    };

    if (body.progress !== undefined) {
      patch.kitchen_progress = body.progress as KitchenProgress;
      if (body.progress > 0 && current.status === "accepted") {
        patch.status = "preparing";
      }
    }

    if (body.label !== undefined) {
      patch.kitchen_stage_label = normalizedLabel || null;
    }

    const [updated] = await client.updateReturning<OrderRow>({
      schema: tenant.schema_name,
      table: "orders",
      query: { id: `eq.${current.id}` },
      patch,
    });

    if (!updated) {
      return c.json({ error: "order_not_found" }, 404);
    }

    await client.insert({
      schema: tenant.schema_name,
      table: "app_events",
      rows: {
        draft_order_id: updated.draft_order_id ?? null,
        order_id: updated.id,
        event_name: "order.kitchen_progress_updated",
        severity: "info",
        source: "dashboard_api",
        metadata: {
          progress: updated.kitchen_progress ?? 0,
          label: updated.kitchen_stage_label ?? null,
          updatedBy: authUser.id,
        },
      },
    }).catch(() => undefined);

    const [customer] = await client.select<{ id: string; phone: string; name?: string }>({
      schema: tenant.schema_name,
      table: "customers",
      query: {
        select: CUSTOMER_SELECT,
        id: `eq.${updated.customer_id}`,
        limit: 1,
      },
    });

    return c.json(mapOrderSummary(updated, customer));
  });
}
