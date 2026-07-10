import { Hono } from "hono";
import type { DashboardNotificationRecord } from "@42day/types";
import { createSupabaseRestClient } from "../../../lib/supabase-rest";
import type { ApiBindings } from "../../../lib/bindings";
import { isMissingTableError } from "../../../shared/errors/supabase";
import { mapDashboardNotification, parsePositiveInt } from "../support/orders";
import type { AppEventRow, CustomerRow, DashboardVariables, DraftOrderRow, OrderRow } from "../types";
import { CUSTOMER_SELECT, DRAFT_ORDER_SELECT, ORDER_SELECT } from "./orders/contracts";

const NOTIFICATION_EVENT_SELECT = "id,conversation_id,draft_order_id,order_id,event_name,severity,source,metadata,created_at";
const NOTIFICATION_EVENT_FILTER =
  "in.(order.pending_restaurant_confirmation_created,whatsapp.customer_notification_failed,whatsapp.customer_notification_sent,order.payment_pending_review,order.payment_confirmed,order.customer_replacement_selected,order.customer_cancelled_after_out_of_stock,order.out_of_stock_returned_to_customer,order.cancelled_by_restaurant)";

export const notificationsDashboardRoutes = new Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>();

notificationsDashboardRoutes.get("/:tenantSlug/notifications", async (c) => {
  const tenant = c.get("tenant");
  const supabase = createSupabaseRestClient(c.env);
  const limit = parsePositiveInt(c.req.query("limit"), 40);
  let events: AppEventRow[] = [];

  try {
    events = await supabase.select<AppEventRow>({
      schema: tenant.schema_name,
      table: "app_events",
      query: {
        select: NOTIFICATION_EVENT_SELECT,
        event_name: NOTIFICATION_EVENT_FILTER,
        order: "created_at.desc",
        limit,
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return c.json([] satisfies DashboardNotificationRecord[]);
    }

    throw error;
  }

  if (events.length === 0) {
    return c.json([] satisfies DashboardNotificationRecord[]);
  }

  const orderIds = Array.from(new Set(events.map((event) => event.order_id).filter((id): id is string => Boolean(id))));
  const draftOrderIds = Array.from(new Set(events.map((event) => event.draft_order_id).filter((id): id is string => Boolean(id))));
  const [orders, draftOrders] = await Promise.all([
    orderIds.length > 0
      ? supabase.select<OrderRow>({
          schema: tenant.schema_name,
          table: "orders",
          query: {
            select: ORDER_SELECT,
            id: `in.(${orderIds.join(",")})`,
            limit: orderIds.length,
          },
        })
      : Promise.resolve([] as OrderRow[]),
    draftOrderIds.length > 0
      ? supabase.select<DraftOrderRow>({
          schema: tenant.schema_name,
          table: "draft_orders",
          query: {
            select: DRAFT_ORDER_SELECT,
            id: `in.(${draftOrderIds.join(",")})`,
            limit: draftOrderIds.length,
          },
        })
      : Promise.resolve([] as DraftOrderRow[]),
  ]);

  const customerIds = Array.from(new Set([
    ...orders.map((order) => order.customer_id),
    ...draftOrders.map((draftOrder) => draftOrder.customer_id),
  ]));
  const customers = customerIds.length > 0
    ? await supabase.select<CustomerRow>({
        schema: tenant.schema_name,
        table: "customers",
        query: {
          select: CUSTOMER_SELECT,
          id: `in.(${customerIds.join(",")})`,
          limit: customerIds.length,
        },
      })
    : [];

  const orderById = new Map(orders.map((order) => [order.id, order]));
  const draftOrderById = new Map(draftOrders.map((draftOrder) => [draftOrder.id, draftOrder]));
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));

  return c.json(events.map((event) => {
    const order = event.order_id ? orderById.get(event.order_id) : undefined;
    const draftOrder = event.draft_order_id ? draftOrderById.get(event.draft_order_id) : undefined;
    const customer = order
      ? customerById.get(order.customer_id)
      : draftOrder
        ? customerById.get(draftOrder.customer_id)
        : undefined;

    return mapDashboardNotification(event, { customer, draftOrder, order });
  }));
});
