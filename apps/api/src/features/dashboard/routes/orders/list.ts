import type { Hono } from "hono";
import type { OrdersDashboardPayload } from "@42day/types";
import { createSupabaseRestClient } from "../../../../lib/supabase-rest";
import type { ApiBindings } from "../../../../lib/bindings";
import { isMissingTableError } from "../../../../shared/errors/supabase";
import { selectAlerts } from "../../support/alerts";
import { mapOrderLineItem, mapOrderSummary, matchesOrdersBucket, parseOrderStatusFilter, parseOrdersBucket, parsePositiveInt } from "../../support/orders";
import type { AlertRow, CustomerRow, DashboardVariables, OrderItemRow, OrderRow } from "../../types";
import { CUSTOMER_SELECT, ORDER_ITEM_SELECT, ORDER_SELECT } from "./contracts";

export function registerOrdersListRoute(routes: Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>) {
  routes.get("/:tenantSlug/orders", async (c) => {
    const tenant = c.get("tenant");
    const supabase = createSupabaseRestClient(c.env);
    const bucket = parseOrdersBucket(c.req.query("bucket"));
    const status = parseOrderStatusFilter(c.req.query("status"));
    const limit = parsePositiveInt(c.req.query("limit"), 200);
    let orders: OrderRow[] = [];
    let customers: CustomerRow[] = [];
    let alerts: AlertRow[] = [];
    let orderItems: OrderItemRow[] = [];

    try {
      [orders, customers, alerts] = await Promise.all([
        supabase.select<OrderRow>({
          schema: tenant.schema_name,
          table: "orders",
          query: {
            select: ORDER_SELECT,
            ...(status ? { status: `eq.${status}` } : {}),
            order: "created_at.desc",
            limit,
          },
        }),
        supabase.select<CustomerRow>({
          schema: tenant.schema_name,
          table: "customers",
          query: {
            select: CUSTOMER_SELECT,
            limit: 500,
          },
        }),
        selectAlerts(supabase, tenant.schema_name, {
          limit: 200,
        }),
      ]);
    } catch (error) {
      if (!isMissingTableError(error)) {
        throw error;
      }
    }

    if (orders.length > 0) {
      try {
        const orderIds = orders.map((order) => order.id);
        const batches = Array.from({ length: Math.ceil(orderIds.length / 50) }, (_, index) => orderIds.slice(index * 50, index * 50 + 50));
        orderItems = (await Promise.all(batches.map((batch) => supabase.select<OrderItemRow>({
          schema: tenant.schema_name,
          table: "order_items",
          query: {
            select: ORDER_ITEM_SELECT,
            order_id: `in.(${batch.join(",")})`,
          },
        })))).flat();
      } catch (error) {
        if (!isMissingTableError(error)) {
          throw error;
        }
      }
    }

    const customerById = new Map(customers.map((customer) => [customer.id, customer]));
    const itemsByOrderId = new Map<string, OrderItemRow[]>();
    for (const item of orderItems) {
      const current = itemsByOrderId.get(item.order_id) ?? [];
      current.push(item);
      itemsByOrderId.set(item.order_id, current);
    }
    const summaries = orders.map((order) => ({
      ...mapOrderSummary(order, customerById.get(order.customer_id)),
      items: (itemsByOrderId.get(order.id) ?? []).map(mapOrderLineItem),
    }));
    const filteredOrders = summaries.filter((order) => matchesOrdersBucket(order, bucket));
    const openAlerts = alerts.filter((alert) => alert.status === "open");
    const payload: OrdersDashboardPayload = {
      bucket,
      counts: {
        pendingConfirmation: summaries.filter((order) => matchesOrdersBucket(order, "pending_confirmation")).length,
        active: summaries.filter((order) => matchesOrdersBucket(order, "active")).length,
        history: summaries.filter((order) => matchesOrdersBucket(order, "history")).length,
        transferPendingReview: summaries.filter((order) => order.status === "payment_pending_review").length,
        openAlerts: openAlerts.length,
      },
      orders: filteredOrders,
    };

    return c.json(payload);
  });
}
