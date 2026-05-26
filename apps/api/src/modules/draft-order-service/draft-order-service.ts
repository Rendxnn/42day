import { calculateDraftTotals, validateDraftForConfirmation } from "@42day/core";
import type { Conversation, DraftOrder, FulfillmentType, MenuItem, OrderLineItem, PaymentMethod } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { createSupabaseRestClient } from "../../lib/supabase-rest";

export function createEmptyDraftOrder(input: {
  id: string;
  locationId?: string;
  items?: OrderLineItem[];
  fulfillmentType?: FulfillmentType;
  serviceTiming?: DraftOrder["serviceTiming"];
  deliveryAddress?: string;
  deliveryAddressId?: string;
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
    locationId: input.locationId,
    fulfillmentType: input.fulfillmentType,
    serviceTiming: input.serviceTiming ?? "asap",
    deliveryAddress: input.deliveryAddress,
    deliveryAddressId: input.deliveryAddressId,
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
  options?: Record<string, unknown>;
  notes?: string;
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

  const existing = input.options || input.notes ? undefined : existingRows[0];

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
        options_snapshot: input.options ?? null,
        notes: input.notes ?? null,
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

export async function removeItemsFromDraftOrder(input: {
  env: ApiBindings;
  schemaName: string;
  draftOrderId: string;
  menuItem?: Pick<MenuItem, "id" | "productId" | "displayName" | "product">;
  targetText?: string;
  quantity?: number;
  deliveryFeeFixed?: number;
}): Promise<{ draft: DraftOrder; changed: boolean }> {
  const client = createSupabaseRestClient(input.env);
  const rows = await loadDraftOrderItemRows(input);
  const matches = findMatchingRows(rows, {
    menuItem: input.menuItem,
    targetText: input.targetText,
  });

  if (matches.length === 0) {
    const draft = await recalculateDraftOrder({
      env: input.env,
      schemaName: input.schemaName,
      draftOrderId: input.draftOrderId,
      deliveryFeeFixed: input.deliveryFeeFixed ?? 0,
    });
    return { draft, changed: false };
  }

  const quantityToRemove = input.quantity && input.quantity > 0 ? Math.round(input.quantity) : undefined;

  for (const row of matches) {
    if (quantityToRemove && quantityToRemove < row.quantity) {
      const nextQuantity = row.quantity - quantityToRemove;
      await client.update({
        schema: input.schemaName,
        table: "draft_order_items",
        values: {
          quantity: nextQuantity,
          line_total: nextQuantity * row.unit_price,
        },
        query: {
          id: `eq.${row.id}`,
        },
      });
      continue;
    }

    await client.delete({
      schema: input.schemaName,
      table: "draft_order_items",
      query: {
        id: `eq.${row.id}`,
      },
    });
  }

  const draft = await recalculateDraftOrder({
    env: input.env,
    schemaName: input.schemaName,
    draftOrderId: input.draftOrderId,
    deliveryFeeFixed: input.deliveryFeeFixed ?? 0,
  });

  return { draft, changed: true };
}

export async function setDraftOrderItemQuantity(input: {
  env: ApiBindings;
  schemaName: string;
  draftOrderId: string;
  menuItem?: Pick<MenuItem, "id" | "productId" | "displayName" | "product">;
  targetText?: string;
  quantity: number;
  deliveryFeeFixed?: number;
}): Promise<{ draft: DraftOrder; changed: boolean }> {
  if (input.quantity <= 0) {
    return removeItemsFromDraftOrder({
      ...input,
      quantity: undefined,
    });
  }

  const client = createSupabaseRestClient(input.env);
  const rows = await loadDraftOrderItemRows(input);
  const matches = findMatchingRows(rows, {
    menuItem: input.menuItem,
    targetText: input.targetText,
  });

  if (matches.length === 0) {
    const draft = await recalculateDraftOrder({
      env: input.env,
      schemaName: input.schemaName,
      draftOrderId: input.draftOrderId,
      deliveryFeeFixed: input.deliveryFeeFixed ?? 0,
    });
    return { draft, changed: false };
  }

  const nextQuantity = Math.max(1, Math.round(input.quantity));
  for (const row of matches) {
    await client.update({
      schema: input.schemaName,
      table: "draft_order_items",
      values: {
        quantity: nextQuantity,
        line_total: nextQuantity * row.unit_price,
      },
      query: {
        id: `eq.${row.id}`,
      },
    });
  }

  const draft = await recalculateDraftOrder({
    env: input.env,
    schemaName: input.schemaName,
    draftOrderId: input.draftOrderId,
    deliveryFeeFixed: input.deliveryFeeFixed ?? 0,
  });

  return { draft, changed: true };
}

export async function updateDraftOrderFulfillment(input: {
  env: ApiBindings;
  schemaName: string;
  draftOrderId: string;
  fulfillmentType: FulfillmentType;
  deliveryFeeFixed?: number;
}): Promise<DraftOrder> {
  const client = createSupabaseRestClient(input.env);
  const patch: Record<string, unknown> = {
    fulfillment_type: input.fulfillmentType,
    updated_at: new Date().toISOString(),
  };

  if (input.fulfillmentType === "pickup") {
    patch.delivery_address = null;
    patch.delivery_address_id = null;
  }

  await client.update({
    schema: input.schemaName,
    table: "draft_orders",
    values: patch,
    query: {
      id: `eq.${input.draftOrderId}`,
    },
  });

  return recalculateDraftOrder({
    env: input.env,
    schemaName: input.schemaName,
    draftOrderId: input.draftOrderId,
    deliveryFeeFixed: input.deliveryFeeFixed ?? 0,
  });
}

export async function updateDraftOrderDeliveryAddress(input: {
  env: ApiBindings;
  schemaName: string;
  draftOrderId: string;
  addressText: string;
  deliveryAddressId?: string;
  deliveryFeeFixed?: number;
}): Promise<DraftOrder> {
  const client = createSupabaseRestClient(input.env);
  await client.update({
    schema: input.schemaName,
    table: "draft_orders",
    values: {
      delivery_address: input.addressText,
      delivery_address_id: input.deliveryAddressId ?? null,
      updated_at: new Date().toISOString(),
    },
    query: {
      id: `eq.${input.draftOrderId}`,
    },
  });

  return recalculateDraftOrder({
    env: input.env,
    schemaName: input.schemaName,
    draftOrderId: input.draftOrderId,
    deliveryFeeFixed: input.deliveryFeeFixed ?? 0,
  });
}

export async function updateDraftOrderPaymentMethod(input: {
  env: ApiBindings;
  schemaName: string;
  draftOrderId: string;
  paymentMethod: PaymentMethod;
  deliveryFeeFixed?: number;
}): Promise<DraftOrder> {
  const client = createSupabaseRestClient(input.env);
  await client.update({
    schema: input.schemaName,
    table: "draft_orders",
    values: {
      payment_method: input.paymentMethod,
      updated_at: new Date().toISOString(),
    },
    query: {
      id: `eq.${input.draftOrderId}`,
    },
  });

  return recalculateDraftOrder({
    env: input.env,
    schemaName: input.schemaName,
    draftOrderId: input.draftOrderId,
    deliveryFeeFixed: input.deliveryFeeFixed ?? 0,
  });
}

async function loadDraftOrderItemRows(input: {
  env: ApiBindings;
  schemaName: string;
  draftOrderId: string;
}): Promise<DraftOrderItemRow[]> {
  return createSupabaseRestClient(input.env).select<DraftOrderItemRow>({
    schema: input.schemaName,
    table: "draft_order_items",
    query: {
      select: "id,draft_order_id,menu_item_id,product_id,combo_id,name_snapshot,quantity,unit_price,options_snapshot,notes,line_total",
      draft_order_id: `eq.${input.draftOrderId}`,
    },
  });
}

function findMatchingRows(rows: DraftOrderItemRow[], input: {
  menuItem?: Pick<MenuItem, "id" | "productId" | "displayName" | "product">;
  targetText?: string;
}): DraftOrderItemRow[] {
  const byMenuItem = input.menuItem?.id ? rows.filter((row) => row.menu_item_id === input.menuItem?.id) : [];
  if (byMenuItem.length > 0) {
    return byMenuItem;
  }

  const byProduct = input.menuItem?.productId ? rows.filter((row) => row.product_id === input.menuItem?.productId) : [];
  if (byProduct.length > 0) {
    return byProduct;
  }

  const target = normalizeMatchText(input.targetText ?? input.menuItem?.displayName ?? input.menuItem?.product?.name);
  if (!target) {
    return [];
  }

  return rows.filter((row) => {
    const candidate = normalizeMatchText(row.name_snapshot);
    return candidate === target || candidate.includes(target) || target.includes(candidate);
  });
}

function normalizeMatchText(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\b(la|el|los|las|un|una|uno|unos|unas|del|de)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .map(singularizeMatchToken)
    .join(" ");
}

function singularizeMatchToken(token: string): string {
  if (token.length > 4 && token.endsWith("es")) {
    return token.slice(0, -2);
  }

  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }

  return token;
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
    locationId: row.location_id ?? undefined,
    fulfillmentType: row.fulfillment_type ?? undefined,
    serviceTiming: row.service_timing ?? "asap",
    scheduledFor: row.scheduled_for ?? undefined,
    deliveryAddress: row.delivery_address ?? undefined,
    deliveryAddressId: row.delivery_address_id ?? undefined,
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
