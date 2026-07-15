import type { Hono } from "hono";
import type { OrderDetail } from "@42day/types";
import { createSupabaseRestClient } from "../../../../lib/supabase-rest";
import type { ApiBindings } from "../../../../lib/bindings";
import { isMissingTableError } from "../../../../shared/errors/supabase";
import { getLatestPaymentProofForOrder } from "../../../payment-proofs/service";
import { mapConversationAutomation, mapOrderLineItem, mapOrderSummary } from "../../support/orders";
import type { ConversationRow, CustomerRow, DashboardVariables, DraftOrderRow, LocationRow, OrderItemRow, OrderRow } from "../../types";
import { CONVERSATION_SELECT, CUSTOMER_SELECT, DRAFT_ORDER_SELECT, ORDER_ITEM_SELECT, ORDER_SELECT } from "./contracts";

export function registerOrdersDetailRoute(routes: Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>) {
  routes.get("/:tenantSlug/orders/:orderId", async (c) => {
    const tenant = c.get("tenant");
    const supabase = createSupabaseRestClient(c.env);
    let order: OrderRow | undefined;

    try {
      [order] = await supabase.select<OrderRow>({
        schema: tenant.schema_name,
        table: "orders",
        query: {
          select: ORDER_SELECT,
          id: `eq.${c.req.param("orderId")}`,
          limit: 1,
        },
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

    const [customer, items, paymentProof, draftOrders, locations] = await Promise.all([
      supabase.select<CustomerRow>({
        schema: tenant.schema_name,
        table: "customers",
        query: {
          select: CUSTOMER_SELECT,
          id: `eq.${order.customer_id}`,
          limit: 1,
        },
      }),
      supabase.select<OrderItemRow>({
        schema: tenant.schema_name,
        table: "order_items",
        query: {
          select: ORDER_ITEM_SELECT,
          order_id: `eq.${order.id}`,
        },
      }),
      getLatestPaymentProofForOrder({
        env: c.env,
        schemaName: tenant.schema_name,
        orderId: order.id,
        paymentProofId: order.payment_proof_file_id ?? undefined,
      }).catch(() => undefined),
      order.draft_order_id ? supabase.select<DraftOrderRow>({
        schema: tenant.schema_name,
        table: "draft_orders",
        query: { select: DRAFT_ORDER_SELECT, id: `eq.${order.draft_order_id}`, limit: 1 },
      }) : Promise.resolve([] as DraftOrderRow[]),
      order.location_id ? supabase.select<LocationRow>({
        schema: tenant.schema_name,
        table: "locations",
        query: {
          select: "id,latitude,longitude,delivery_radius_km",
          id: `eq.${order.location_id}`,
          limit: 1,
        },
      }).catch(() => [] as LocationRow[]) : Promise.resolve([] as LocationRow[]),
    ]);
    const draftOrder = draftOrders[0];
    const conversations = draftOrder?.conversation_id
      ? await supabase.select<ConversationRow>({
        schema: tenant.schema_name,
        table: "conversations",
        query: { select: CONVERSATION_SELECT, id: `eq.${draftOrder.conversation_id}`, limit: 1 },
      })
      : [];

    const detail: OrderDetail = {
      ...mapOrderSummary(order, customer[0]),
      locationId: order.location_id ?? undefined,
      restaurantLocation: locations[0]?.latitude !== undefined && locations[0]?.latitude !== null
        && locations[0]?.longitude !== undefined && locations[0]?.longitude !== null
        ? {
          latitude: locations[0].latitude,
          longitude: locations[0].longitude,
          deliveryRadiusKm: locations[0].delivery_radius_km ?? undefined,
        }
        : undefined,
      deliveryAddress: order.delivery_address ?? undefined,
      deliveryAddressId: order.delivery_address_id ?? undefined,
      items: items.map(mapOrderLineItem),
      paymentProof,
      conversationId: conversations[0]?.id,
      conversationAutomation: conversations[0] ? mapConversationAutomation(conversations[0]) : undefined,
    };

    return c.json(detail);
  });
}
