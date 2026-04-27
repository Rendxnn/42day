import type { DraftOrder, HumanInterventionType, Order, OrderLineItem, OrderStatus } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { createSupabaseRestClient } from "../../lib/supabase-rest";

type OrderRow = {
  id: string;
  draft_order_id?: string | null;
  customer_id: string;
  location_id?: string | null;
  status: OrderStatus;
  fulfillment_type: "delivery" | "pickup";
  service_timing: "asap" | "scheduled";
  scheduled_for?: string | null;
  delivery_address?: string | null;
  delivery_address_id?: string | null;
  payment_method: "cash" | "transfer";
  payment_proof_file_id?: string | null;
  subtotal: number;
  delivery_fee: number;
  discount_total: number;
  total: number;
  restaurant_confirmed_at?: string | null;
  payment_confirmed_at?: string | null;
  created_at: string;
  updated_at: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id?: string | null;
  combo_id?: string | null;
  name_snapshot: string;
  quantity: number;
  unit_price: number;
  options_snapshot?: Record<string, unknown> | null;
  notes?: string | null;
  line_total: number;
};

export type PersistConfirmedOrderInput = {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
  customerId: string;
  draft: DraftOrder;
};

export async function persistConfirmedOrder(input: PersistConfirmedOrderInput): Promise<Order> {
  if (!input.draft.fulfillmentType || !input.draft.paymentMethod) {
    throw new Error("order.confirmation_missing_required_fields");
  }

  const client = createSupabaseRestClient(input.env);
  const now = new Date().toISOString();
  const status: OrderStatus = input.draft.paymentMethod === "transfer" ? "payment_pending_review" : "new";

  const [created] = await client.insertReturning<OrderRow>({
    schema: input.schemaName,
    table: "orders",
    rows: {
      draft_order_id: input.draft.id,
      customer_id: input.customerId,
      location_id: input.draft.locationId ?? null,
      status,
      fulfillment_type: input.draft.fulfillmentType,
      service_timing: input.draft.serviceTiming ?? "asap",
      scheduled_for: input.draft.scheduledFor ?? null,
      delivery_address: input.draft.deliveryAddress ?? null,
      delivery_address_id: input.draft.deliveryAddressId ?? null,
      payment_method: input.draft.paymentMethod,
      subtotal: input.draft.subtotal,
      delivery_fee: input.draft.deliveryFee,
      discount_total: input.draft.discountTotal,
      total: input.draft.total,
    },
  });

  if (!created) {
    throw new Error("order.create_failed");
  }

  if (input.draft.items.length > 0) {
    await client.insert({
      schema: input.schemaName,
      table: "order_items",
      rows: input.draft.items.map((item) => mapLineItemToOrderItem(created.id, item)),
    });
  }

  await client.update({
    schema: input.schemaName,
    table: "draft_orders",
    values: {
      status: "confirmed",
      updated_at: now,
    },
    query: {
      id: `eq.${input.draft.id}`,
    },
  });

  await client.insert({
    schema: input.schemaName,
    table: "human_intervention_alerts",
    rows: buildPendingAlerts({
      conversationId: input.conversationId,
      draftOrderId: input.draft.id,
      orderId: created.id,
      paymentMethod: input.draft.paymentMethod,
    }),
  });

  return mapOrder(created);
}

function buildPendingAlerts(input: {
  conversationId: string;
  draftOrderId: string;
  orderId: string;
  paymentMethod: DraftOrder["paymentMethod"];
}): Array<Record<string, unknown>> {
  const alerts: Array<Record<string, unknown>> = [
    buildAlertRow({
      conversationId: input.conversationId,
      draftOrderId: input.draftOrderId,
      orderId: input.orderId,
      type: "order_pending_confirmation",
      title: "Pedido pendiente por confirmar",
      description: "El cliente ya confirmo el pedido y el restaurante debe revisarlo.",
    }),
  ];

  if (input.paymentMethod === "transfer") {
    alerts.push(
      buildAlertRow({
        conversationId: input.conversationId,
        draftOrderId: input.draftOrderId,
        orderId: input.orderId,
        type: "transfer_payment_review",
        title: "Pedido pendiente de pago por transferencia",
        description: "Queda pendiente revisar y confirmar el pago cuando llegue el comprobante.",
      }),
    );
  }

  return alerts;
}

function buildAlertRow(input: {
  conversationId: string;
  draftOrderId: string;
  orderId: string;
  type: HumanInterventionType;
  title: string;
  description: string;
}): Record<string, unknown> {
  return {
    conversation_id: input.conversationId,
    draft_order_id: input.draftOrderId,
    order_id: input.orderId,
    type: input.type,
    title: input.title,
    description: input.description,
    status: "open",
  };
}

function mapLineItemToOrderItem(orderId: string, item: OrderLineItem): Record<string, unknown> {
  return {
    order_id: orderId,
    product_id: item.productId ?? null,
    combo_id: item.comboId ?? null,
    name_snapshot: item.name,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    options_snapshot: item.options ?? null,
    notes: item.notes ?? null,
    line_total: item.lineTotal,
  };
}

function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    draftOrderId: row.draft_order_id ?? undefined,
    customerId: row.customer_id,
    locationId: row.location_id ?? undefined,
    status: row.status,
    fulfillmentType: row.fulfillment_type,
    serviceTiming: row.service_timing ?? "asap",
    scheduledFor: row.scheduled_for ?? undefined,
    deliveryAddress: row.delivery_address ?? undefined,
    deliveryAddressId: row.delivery_address_id ?? undefined,
    paymentMethod: row.payment_method,
    paymentProofFileId: row.payment_proof_file_id ?? undefined,
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee,
    discountTotal: row.discount_total,
    total: row.total,
    restaurantConfirmedAt: row.restaurant_confirmed_at ?? undefined,
    paymentConfirmedAt: row.payment_confirmed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
