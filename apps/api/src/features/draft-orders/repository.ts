import type { BillingType, Conversation, CoverageConfidence, CoverageValidationMethod, DraftOrder, FulfillmentType, MenuItem, OrderLineItem, OrderLineItemOptionsSnapshot, PaymentMethod } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { createSupabaseRestClient } from "../../lib/supabase-rest";

export type DraftOrderRow = {
  id: string;
  conversation_id: string;
  customer_id: string;
  location_id?: string | null;
  status: DraftOrder["status"];
  fulfillment_type?: FulfillmentType | null;
  service_timing?: DraftOrder["serviceTiming"] | null;
  scheduled_for?: string | null;
  delivery_address?: string | null;
  delivery_address_id?: string | null;
  customer_address_text?: string | null;
  customer_latitude?: number | null;
  customer_longitude?: number | null;
  delivery_distance_km?: number | null;
  is_inside_delivery_coverage?: boolean | null;
  coverage_validation_method?: CoverageValidationMethod | null;
  coverage_confidence?: CoverageConfidence | null;
  coverage_checked_at?: string | null;
  payment_method?: PaymentMethod | null;
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

const DRAFT_ORDER_SELECT_COLUMNS =
  "id,conversation_id,customer_id,location_id,status,fulfillment_type,service_timing,scheduled_for,delivery_address,delivery_address_id,customer_address_text,customer_latitude,customer_longitude,delivery_distance_km,is_inside_delivery_coverage,coverage_validation_method,coverage_confidence,coverage_checked_at,payment_method,billing_type,billing_profile_id,billing_full_name,billing_address,billing_legal_name,billing_tax_id,billing_email,subtotal,delivery_fee,discount_total,total,validation_errors,expires_at,created_at,updated_at";

const DRAFT_ORDER_ITEM_SELECT_COLUMNS =
  "id,draft_order_id,menu_item_id,product_id,combo_id,name_snapshot,quantity,unit_price,options_snapshot,notes,line_total";

export async function loadDraftOrderById(input: {
  env: ApiBindings;
  schemaName: string;
  draftOrderId: string;
}): Promise<DraftOrderRow | undefined> {
  const [row] = await createSupabaseRestClient(input.env).select<DraftOrderRow>({
    schema: input.schemaName,
    table: "draft_orders",
    query: {
      select: DRAFT_ORDER_SELECT_COLUMNS,
      id: `eq.${input.draftOrderId}`,
      limit: 1,
    },
  });

  return row;
}

export async function loadReusableDraftOrderByConversation(input: {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
}): Promise<DraftOrderRow | undefined> {
  const [row] = await createSupabaseRestClient(input.env).select<DraftOrderRow>({
    schema: input.schemaName,
    table: "draft_orders",
    query: {
      select: DRAFT_ORDER_SELECT_COLUMNS,
      conversation_id: `eq.${input.conversationId}`,
      status: "in.(draft,needs_clarification,ready_for_confirmation)",
      order: "updated_at.desc",
      limit: 1,
    },
  });

  return row;
}

export async function createDraftOrderRow(input: {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
  customerId: string;
  locationId?: string;
}): Promise<DraftOrderRow> {
  const [created] = await createSupabaseRestClient(input.env).insertReturning<DraftOrderRow>({
    schema: input.schemaName,
    table: "draft_orders",
    rows: {
      conversation_id: input.conversationId,
      customer_id: input.customerId,
      location_id: input.locationId ?? null,
      status: "draft",
      service_timing: "asap",
      subtotal: 0,
      delivery_fee: 0,
      discount_total: 0,
      total: 0,
    },
  });

  if (!created) {
    throw new Error("draft_order.create_failed");
  }

  return created;
}

export async function linkConversationToDraftOrder(input: {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
  draftOrderId: string;
}): Promise<void> {
  await createSupabaseRestClient(input.env).update({
    schema: input.schemaName,
    table: "conversations",
    values: {
      current_draft_order_id: input.draftOrderId,
      updated_at: new Date().toISOString(),
    },
    query: {
      id: `eq.${input.conversationId}`,
    },
  });
}

export async function loadDraftOrderItems(input: {
  env: ApiBindings;
  schemaName: string;
  draftOrderId: string;
}): Promise<DraftOrderItemRow[]> {
  return createSupabaseRestClient(input.env).select<DraftOrderItemRow>({
    schema: input.schemaName,
    table: "draft_order_items",
    query: {
      select: DRAFT_ORDER_ITEM_SELECT_COLUMNS,
      draft_order_id: `eq.${input.draftOrderId}`,
    },
  });
}

export async function loadDraftOrderState(input: {
  env: ApiBindings;
  schemaName: string;
  draftOrderId: string;
}): Promise<{ row: DraftOrderRow; items: DraftOrderItemRow[] } | undefined> {
  const [row, items] = await Promise.all([
    loadDraftOrderById(input),
    loadDraftOrderItems(input),
  ]);

  if (!row) {
    return undefined;
  }

  return { row, items };
}

export async function insertDraftOrderItem(input: {
  env: ApiBindings;
  schemaName: string;
  draftOrderId: string;
  menuItem: MenuItem;
  quantity: number;
  options?: OrderLineItemOptionsSnapshot;
  notes?: string;
  unitPrice: number;
}): Promise<void> {
  await createSupabaseRestClient(input.env).insert({
    schema: input.schemaName,
    table: "draft_order_items",
    rows: {
      draft_order_id: input.draftOrderId,
      menu_item_id: input.menuItem.id,
      product_id: input.menuItem.productId ?? null,
      combo_id: input.menuItem.comboId ?? null,
      name_snapshot: input.menuItem.displayName ?? input.menuItem.product?.name ?? "Producto",
      quantity: input.quantity,
      unit_price: input.unitPrice,
      options_snapshot: input.options ?? null,
      notes: input.notes ?? null,
      line_total: input.quantity * input.unitPrice,
    },
  });
}

export async function updateDraftOrderItem(input: {
  env: ApiBindings;
  schemaName: string;
  id: string;
  quantity: number;
  lineTotal: number;
  unitPrice?: number;
  menuItem?: MenuItem;
  optionsSnapshot?: OrderLineItemOptionsSnapshot | null;
  notes?: string | null;
}): Promise<void> {
  const values: Record<string, unknown> = {
    quantity: input.quantity,
    line_total: input.lineTotal,
  };

  if (input.unitPrice !== undefined) {
    values.unit_price = input.unitPrice;
  }
  if (input.menuItem) {
    values.menu_item_id = input.menuItem.id;
    values.product_id = input.menuItem.productId ?? null;
    values.combo_id = input.menuItem.comboId ?? null;
    values.name_snapshot = input.menuItem.displayName ?? input.menuItem.product?.name ?? "Producto";
  }
  if (input.optionsSnapshot !== undefined) {
    values.options_snapshot = input.optionsSnapshot;
  }
  if (input.notes !== undefined) {
    values.notes = input.notes;
  }

  await createSupabaseRestClient(input.env).update({
    schema: input.schemaName,
    table: "draft_order_items",
    values,
    query: {
      id: `eq.${input.id}`,
    },
  });
}

export async function deleteDraftOrderItem(input: {
  env: ApiBindings;
  schemaName: string;
  id: string;
}): Promise<void> {
  await createSupabaseRestClient(input.env).delete({
    schema: input.schemaName,
    table: "draft_order_items",
    query: {
      id: `eq.${input.id}`,
    },
  });
}

export async function updateDraftOrderRow(input: {
  env: ApiBindings;
  schemaName: string;
  draftOrderId: string;
  values: Record<string, unknown>;
}): Promise<void> {
  await createSupabaseRestClient(input.env).update({
    schema: input.schemaName,
    table: "draft_orders",
    values: {
      ...input.values,
      updated_at: new Date().toISOString(),
    },
    query: {
      id: `eq.${input.draftOrderId}`,
    },
  });
}
