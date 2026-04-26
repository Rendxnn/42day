import { calculateDraftTotals, validateDraftForConfirmation } from "@42day/core";
import type { Conversation, DraftOrder, FulfillmentType, MenuItem, OrderLineItem, PaymentMethod } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { createSupabaseRestClient } from "../../lib/supabase-rest";

export function createEmptyDraftOrder(input: {
  id: string;
  items?: OrderLineItem[];
  fulfillmentType?: FulfillmentType;
  serviceTiming?: DraftOrder["serviceTiming"];
  deliveryAddress?: string;
  paymentMethod?: PaymentMethod;
  deliveryFeeFixed?: number;
}): DraftOrder {
  const totals = calculateDraftTotals({
    items: input.items ?? [],
    fulfillmentType: input.fulfillmentType,
    deliveryFeeFixed: input.deliveryFeeFixed ?? 0,
  });

  return {
    id: input.id,
    status: "draft",
    fulfillmentType: input.fulfillmentType,
    serviceTiming: input.serviceTiming ?? "asap",
    deliveryAddress: input.deliveryAddress,
    paymentMethod: input.paymentMethod,
    items: input.items ?? [],
    ...totals,
  };
}

export function markDraftReadyIfValid(draft: DraftOrder): DraftOrder {
  const validation = validateDraftForConfirmation(draft);

  return {
    ...draft,
    status: validation.ok ? "ready_for_confirmation" : "needs_clarification",
    validationErrors: validation.errors,
  };
}

type DraftOrderRow = {
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
  payment_method?: PaymentMethod | null;
  subtotal: number;
  delivery_fee: number;
  discount_total: number;
  total: number;
  validation_errors?: string[] | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
};

type DraftOrderItemRow = {
  id: string;
  draft_order_id: string;
  menu_item_id?: string | null;
  product_id?: string | null;
  combo_id?: string | null;
  name_snapshot: string;
  quantity: number;
  unit_price: number;
  options_snapshot?: Record<string, unknown> | null;
  notes?: string | null;
  line_total: number;
};

export async function getOrCreateActiveDraftOrder(input: {
  env: ApiBindings;
  schemaName: string;
  conversation: Conversation;
  customerId: string;
  locationId?: string;
  deliveryFeeFixed?: number;
}): Promise<DraftOrder> {
  const client = createSupabaseRestClient(input.env);
  const candidateIds = [input.conversation.currentDraftOrderId].filter(Boolean) as string[];

  if (candidateIds.length > 0) {
    const [existing] = await client.select<DraftOrderRow>({
      schema: input.schemaName,
      table: "draft_orders",
      query: {
        select:
          "id,conversation_id,customer_id,location_id,status,fulfillment_type,service_timing,scheduled_for,delivery_address,delivery_address_id,payment_method,subtotal,delivery_fee,discount_total,total,validation_errors,expires_at,created_at,updated_at",
        id: `eq.${candidateIds[0]}`,
        limit: 1,
      },
    });

    if (existing) {
      return hydrateDraftOrder({
        env: input.env,
        schemaName: input.schemaName,
        row: existing,
      });
    }
  }

  const [reusable] = await client.select<DraftOrderRow>({
    schema: input.schemaName,
    table: "draft_orders",
    query: {
      select:
        "id,conversation_id,customer_id,location_id,status,fulfillment_type,service_timing,scheduled_for,delivery_address,delivery_address_id,payment_method,subtotal,delivery_fee,discount_total,total,validation_errors,expires_at,created_at,updated_at",
      conversation_id: `eq.${input.conversation.id}`,
      status: "in.(draft,needs_clarification,ready_for_confirmation)",
      order: "updated_at.desc",
      limit: 1,
    },
  });

  if (reusable) {
    return hydrateDraftOrder({
      env: input.env,
      schemaName: input.schemaName,
      row: reusable,
    });
  }

  const [created] = await client.insertReturning<DraftOrderRow>({
    schema: input.schemaName,
    table: "draft_orders",
    rows: {
      conversation_id: input.conversation.id,
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

  await client.update({
    schema: input.schemaName,
    table: "conversations",
    values: {
      current_draft_order_id: created.id,
      updated_at: new Date().toISOString(),
    },
    query: {
      id: `eq.${input.conversation.id}`,
    },
  });

  return mapDraftOrder(created, []);
}

export async function addMenuItemToDraftOrder(input: {
  env: ApiBindings;
  schemaName: string;
  draftOrderId: string;
  menuItem: MenuItem;
  quantity?: number;
  deliveryFeeFixed?: number;
}): Promise<DraftOrder> {
  const client = createSupabaseRestClient(input.env);
  const quantity = Math.max(1, input.quantity ?? 1);
  const unitPrice = input.menuItem.priceOverride ?? input.menuItem.product?.basePrice ?? 0;
  const lineName = input.menuItem.displayName ?? input.menuItem.product?.name ?? "Producto";
  const existingRows = await client.select<DraftOrderItemRow>({
    schema: input.schemaName,
    table: "draft_order_items",
    query: {
      select: "id,draft_order_id,menu_item_id,product_id,combo_id,name_snapshot,quantity,unit_price,options_snapshot,notes,line_total",
      draft_order_id: `eq.${input.draftOrderId}`,
      ...(input.menuItem.id ? { menu_item_id: `eq.${input.menuItem.id}` } : {}),
      limit: 1,
    },
  });

  const existing = existingRows[0];

  if (existing) {
    const nextQuantity = existing.quantity + quantity;
    await client.update({
      schema: input.schemaName,
      table: "draft_order_items",
      values: {
        quantity: nextQuantity,
        line_total: nextQuantity * existing.unit_price,
      },
      query: {
        id: `eq.${existing.id}`,
      },
    });
  } else {
    await client.insert({
      schema: input.schemaName,
      table: "draft_order_items",
      rows: {
        draft_order_id: input.draftOrderId,
        menu_item_id: input.menuItem.id,
        product_id: input.menuItem.productId ?? null,
        combo_id: input.menuItem.comboId ?? null,
        name_snapshot: lineName,
        quantity,
        unit_price: unitPrice,
        line_total: quantity * unitPrice,
      },
    });
  }

  return recalculateDraftOrder({
    env: input.env,
    schemaName: input.schemaName,
    draftOrderId: input.draftOrderId,
    deliveryFeeFixed: input.deliveryFeeFixed ?? 0,
  });
}

async function recalculateDraftOrder(input: {
  env: ApiBindings;
  schemaName: string;
  draftOrderId: string;
  deliveryFeeFixed: number;
}): Promise<DraftOrder> {
  const client = createSupabaseRestClient(input.env);
  const [draftRow, itemRows] = await Promise.all([
    client.select<DraftOrderRow>({
      schema: input.schemaName,
      table: "draft_orders",
      query: {
        select:
          "id,conversation_id,customer_id,location_id,status,fulfillment_type,service_timing,scheduled_for,delivery_address,delivery_address_id,payment_method,subtotal,delivery_fee,discount_total,total,validation_errors,expires_at,created_at,updated_at",
        id: `eq.${input.draftOrderId}`,
        limit: 1,
      },
    }),
    client.select<DraftOrderItemRow>({
      schema: input.schemaName,
      table: "draft_order_items",
      query: {
        select: "id,draft_order_id,menu_item_id,product_id,combo_id,name_snapshot,quantity,unit_price,options_snapshot,notes,line_total",
        draft_order_id: `eq.${input.draftOrderId}`,
      },
    }),
  ]);

  const row = draftRow[0];

  if (!row) {
    throw new Error("draft_order.not_found");
  }

  const draft = mapDraftOrder(row, itemRows.map(mapLineItem));
  const nextDraft = markDraftReadyIfValid({
    ...draft,
    ...calculateDraftTotals({
      items: draft.items,
      fulfillmentType: draft.fulfillmentType,
      deliveryFeeFixed: input.deliveryFeeFixed,
      discountTotal: draft.discountTotal,
    }),
  });

  const [updated] = await client.updateReturning<DraftOrderRow>({
    schema: input.schemaName,
    table: "draft_orders",
    query: {
      id: `eq.${input.draftOrderId}`,
    },
    patch: {
      status: nextDraft.status,
      subtotal: nextDraft.subtotal,
      delivery_fee: nextDraft.deliveryFee,
      discount_total: nextDraft.discountTotal,
      total: nextDraft.total,
      validation_errors: nextDraft.validationErrors ?? [],
      updated_at: new Date().toISOString(),
    },
  });

  if (!updated) {
    throw new Error("draft_order.update_failed");
  }

  return mapDraftOrder(updated, draft.items);
}

async function hydrateDraftOrder(input: {
  env: ApiBindings;
  schemaName: string;
  row: DraftOrderRow;
}): Promise<DraftOrder> {
  const items = await createSupabaseRestClient(input.env).select<DraftOrderItemRow>({
    schema: input.schemaName,
    table: "draft_order_items",
    query: {
      select: "id,draft_order_id,menu_item_id,product_id,combo_id,name_snapshot,quantity,unit_price,options_snapshot,notes,line_total",
      draft_order_id: `eq.${input.row.id}`,
    },
  });

  return mapDraftOrder(input.row, items.map(mapLineItem));
}

function mapDraftOrder(row: DraftOrderRow, items: OrderLineItem[]): DraftOrder {
  return {
    id: row.id,
    status: row.status,
    fulfillmentType: row.fulfillment_type ?? undefined,
    serviceTiming: row.service_timing ?? "asap",
    scheduledFor: row.scheduled_for ?? undefined,
    deliveryAddress: row.delivery_address ?? undefined,
    paymentMethod: row.payment_method ?? undefined,
    items,
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee,
    discountTotal: row.discount_total,
    total: row.total,
    validationErrors: row.validation_errors ?? undefined,
    expiresAt: row.expires_at ?? undefined,
  };
}

function mapLineItem(row: DraftOrderItemRow): OrderLineItem {
  return {
    menuItemId: row.menu_item_id ?? undefined,
    productId: row.product_id ?? undefined,
    comboId: row.combo_id ?? undefined,
    name: row.name_snapshot,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    options: row.options_snapshot ?? undefined,
    notes: row.notes ?? undefined,
    lineTotal: row.line_total,
  };
}
