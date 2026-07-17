import type { BillingType, DraftOrder, OrderLineItemOptionsSnapshot, OrderStatus, OutOfStockReplacementOption } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { createSupabaseRestClient } from "../../lib/supabase-rest";

export type OrderRow = {
  id: string;
  draft_order_id?: string | null;
  customer_id: string;
  location_id?: string | null;
  status: OrderStatus;
  fulfillment_type: "delivery" | "pickup";
  service_timing: "asap" | "scheduled";
  scheduled_for?: string | null;
  delivery_address?: string | null;
  delivery_address_details?: string | null;
  delivery_address_id?: string | null;
  customer_address_text?: string | null;
  resolved_delivery_address?: string | null;
  customer_latitude?: number | null;
  customer_longitude?: number | null;
  delivery_distance_km?: number | null;
  is_inside_delivery_coverage?: boolean | null;
  coverage_validation_method?: OrderRowCoverageMethod | null;
  coverage_confidence?: OrderRowCoverageConfidence | null;
  coverage_checked_at?: string | null;
  payment_method: "cash" | "transfer";
  payment_proof_file_id?: string | null;
  billing_type?: BillingType | null;
  billing_profile_id?: string | null;
  billing_full_name?: string | null;
  billing_address?: string | null;
  billing_legal_name?: string | null;
  billing_tax_id?: string | null;
  billing_email?: string | null;
  subtotal: number;
  delivery_fee: number;
  discount_total: number;
  total: number;
  restaurant_reviewed_at?: string | null;
  restaurant_reviewed_by?: string | null;
  restaurant_confirmed_at?: string | null;
  restaurant_confirmed_by?: string | null;
  restaurant_review_note?: string | null;
  restaurant_review_metadata?: Record<string, unknown> | null;
  customer_notified_at?: string | null;
  customer_notification_status?: "pending" | "sent" | "failed" | null;
  customer_notification_error?: string | null;
  payment_confirmed_at?: string | null;
  created_at: string;
  updated_at: string;
};

type OrderRowCoverageMethod = "whatsapp_location" | "written_address_reference" | "geocoded_address" | "not_validated";
type OrderRowCoverageConfidence = "high" | "medium" | "low" | "failed";

export type OrderItemRow = {
  id: string;
  order_id: string;
  menu_item_id?: string | null;
  product_id?: string | null;
  combo_id?: string | null;
  category_snapshot?: string | null;
  name_snapshot: string;
  quantity: number;
  unit_price: number;
  options_snapshot?: OrderLineItemOptionsSnapshot | null;
  notes?: string | null;
  line_total: number;
};

export type DraftOrderRow = {
  id: string;
  conversation_id: string;
  customer_id: string;
  location_id?: string | null;
  status: DraftOrder["status"];
  fulfillment_type?: "delivery" | "pickup" | null;
  service_timing?: DraftOrder["serviceTiming"] | null;
  scheduled_for?: string | null;
  delivery_address?: string | null;
  delivery_address_details?: string | null;
  delivery_address_id?: string | null;
  customer_address_text?: string | null;
  resolved_delivery_address?: string | null;
  customer_latitude?: number | null;
  customer_longitude?: number | null;
  delivery_distance_km?: number | null;
  is_inside_delivery_coverage?: boolean | null;
  coverage_validation_method?: OrderRowCoverageMethod | null;
  coverage_confidence?: OrderRowCoverageConfidence | null;
  coverage_checked_at?: string | null;
  payment_method?: "cash" | "transfer" | null;
  billing_type?: BillingType | null;
  billing_profile_id?: string | null;
  billing_full_name?: string | null;
  billing_address?: string | null;
  billing_legal_name?: string | null;
  billing_tax_id?: string | null;
  billing_email?: string | null;
  subtotal: number;
  delivery_fee: number;
  discount_total: number;
  total: number;
  validation_errors?: string[] | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type DraftOrderItemRow = {
  id: string;
  draft_order_id: string;
  menu_item_id?: string | null;
  product_id?: string | null;
  combo_id?: string | null;
  name_snapshot: string;
  quantity: number;
  unit_price: number;
  options_snapshot?: OrderLineItemOptionsSnapshot | null;
  notes?: string | null;
  line_total: number;
};

type PendingCustomerReplacementOrderContext = {
  order: OrderRow;
  draftOrder?: DraftOrderRow;
  unavailableOrderItem: OrderItemRow;
  replacementOptions: OutOfStockReplacementOption[];
};

export async function loadPendingCustomerReplacementOrderContext(input: {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
  currentDraftOrderId?: string;
}): Promise<PendingCustomerReplacementOrderContext | undefined> {
  const client = createSupabaseRestClient(input.env);
  const candidateDraftIds = new Set<string>();

  if (input.currentDraftOrderId) {
    candidateDraftIds.add(input.currentDraftOrderId);
  }

  const draftOrders = await client.select<Pick<DraftOrderRow, "id" | "conversation_id" | "status" | "subtotal" | "delivery_fee" | "discount_total" | "total" | "updated_at">>({
    schema: input.schemaName,
    table: "draft_orders",
    query: {
      select: "id,conversation_id,status,subtotal,delivery_fee,discount_total,total,updated_at",
      conversation_id: `eq.${input.conversationId}`,
      order: "updated_at.desc",
      limit: 5,
    },
  }).catch(() => []);

  for (const draftOrder of draftOrders) {
    candidateDraftIds.add(draftOrder.id);
  }

  if (candidateDraftIds.size === 0) {
    return undefined;
  }

  const [order] = await client.select<OrderRow>({
    schema: input.schemaName,
    table: "orders",
    query: {
      select:
        "id,draft_order_id,customer_id,location_id,status,fulfillment_type,service_timing,scheduled_for,delivery_address,delivery_address_details,delivery_address_id,customer_address_text,resolved_delivery_address,customer_latitude,customer_longitude,delivery_distance_km,is_inside_delivery_coverage,coverage_validation_method,coverage_confidence,coverage_checked_at,payment_method,payment_proof_file_id,billing_type,billing_profile_id,billing_full_name,billing_address,billing_legal_name,billing_tax_id,billing_email,subtotal,delivery_fee,discount_total,total,restaurant_reviewed_at,restaurant_reviewed_by,restaurant_confirmed_at,restaurant_confirmed_by,restaurant_review_note,restaurant_review_metadata,customer_notified_at,customer_notification_status,customer_notification_error,payment_confirmed_at,created_at,updated_at",
      draft_order_id: `in.(${Array.from(candidateDraftIds).join(",")})`,
      status: "eq.needs_customer_replacement",
      order: "updated_at.desc",
      limit: 1,
    },
  });

  if (!order) {
    return undefined;
  }

  const [draftOrder, orderItems] = await Promise.all([
    order.draft_order_id
      ? client.select<DraftOrderRow>({
          schema: input.schemaName,
          table: "draft_orders",
          query: {
            select:
              "id,conversation_id,customer_id,location_id,status,fulfillment_type,service_timing,scheduled_for,delivery_address,delivery_address_details,delivery_address_id,customer_address_text,resolved_delivery_address,customer_latitude,customer_longitude,delivery_distance_km,is_inside_delivery_coverage,coverage_validation_method,coverage_confidence,coverage_checked_at,payment_method,billing_type,billing_profile_id,billing_full_name,billing_address,billing_legal_name,billing_tax_id,billing_email,subtotal,delivery_fee,discount_total,total,validation_errors,expires_at,created_at,updated_at",
            id: `eq.${order.draft_order_id}`,
            limit: 1,
          },
        })
      : Promise.resolve([]),
    client.select<OrderItemRow>({
      schema: input.schemaName,
      table: "order_items",
      query: {
        select: "id,order_id,menu_item_id,product_id,combo_id,category_snapshot,name_snapshot,quantity,unit_price,options_snapshot,notes,line_total",
        order_id: `eq.${order.id}`,
      },
    }),
  ]);

  const replacementOptions = parseReplacementOptions(order.restaurant_review_metadata);
  const unavailableOrderItemId = parseUnavailableOrderItemId(order.restaurant_review_metadata);
  const unavailableOrderItem =
    orderItems.find((item) => item.id === unavailableOrderItemId) ??
    orderItems.find((item) => item.id === order.restaurant_review_metadata?.["unavailableOrderItemId"]) ??
    orderItems[0];

  if (!unavailableOrderItem) {
    return undefined;
  }

  return {
    order,
    draftOrder: draftOrder[0],
    unavailableOrderItem,
    replacementOptions,
  };
}

function parseReplacementOptions(metadata: Record<string, unknown> | null | undefined): OutOfStockReplacementOption[] {
  const rawItems = Array.isArray(metadata?.replacementMenuItems) ? metadata.replacementMenuItems : [];
  const options: OutOfStockReplacementOption[] = [];

  for (const item of rawItems) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const menuItemId = "menuItemId" in item && typeof item.menuItemId === "string" ? item.menuItemId : undefined;
    const name = "name" in item && typeof item.name === "string" ? item.name : undefined;

    if (!menuItemId || !name) {
      continue;
    }

    options.push({
      menuItemId,
      productId: "productId" in item && typeof item.productId === "string" ? item.productId : undefined,
      comboId: "comboId" in item && typeof item.comboId === "string" ? item.comboId : undefined,
      category: "category" in item && typeof item.category === "string" ? item.category : undefined,
      name,
      price: "price" in item && item.price !== undefined ? Number(item.price) : undefined,
    });
  }

  return options;
}

function parseUnavailableOrderItemId(metadata: Record<string, unknown> | null | undefined): string | undefined {
  if (!metadata) {
    return undefined;
  }

  if (Array.isArray(metadata.unavailableOrderItemIds) && typeof metadata.unavailableOrderItemIds[0] === "string") {
    return metadata.unavailableOrderItemIds[0];
  }

  if (Array.isArray(metadata.unavailableItems) && metadata.unavailableItems[0] && typeof metadata.unavailableItems[0] === "object") {
    const firstItem = metadata.unavailableItems[0] as Record<string, unknown>;
    return typeof firstItem.orderItemId === "string" ? firstItem.orderItemId : undefined;
  }

  return undefined;
}
