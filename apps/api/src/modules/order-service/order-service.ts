import type { DraftOrder, HumanInterventionType, Order, OrderLineItem, OrderStatus, OutOfStockReplacementOption } from "@42day/types";
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

type OrderItemRow = {
  id: string;
  order_id: string;
  menu_item_id?: string | null;
  product_id?: string | null;
  combo_id?: string | null;
  category_snapshot?: string | null;
  name_snapshot: string;
  quantity: number;
  unit_price: number;
  options_snapshot?: Record<string, unknown> | null;
  notes?: string | null;
  line_total: number;
};

type DraftOrderRow = {
  id: string;
  conversation_id: string;
  customer_id: string;
  location_id?: string | null;
  status: DraftOrder["status"];
  fulfillment_type?: "delivery" | "pickup" | null;
  service_timing?: DraftOrder["serviceTiming"] | null;
  scheduled_for?: string | null;
  delivery_address?: string | null;
  delivery_address_id?: string | null;
  payment_method?: "cash" | "transfer" | null;
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

type MenuItemRow = {
  id: string;
  menu_id: string;
  product_id?: string | null;
  combo_id?: string | null;
  display_name?: string | null;
  price_override?: number | null;
  available_quantity?: number | null;
  is_available: boolean;
  sort_order: number;
};

type ProductRow = {
  id: string;
  name: string;
  base_price: number;
  category?: string | null;
  is_active: boolean;
};

type PendingCustomerReplacementOrderContext = {
  order: OrderRow;
  draftOrder?: DraftOrderRow;
  unavailableOrderItem: OrderItemRow;
  replacementOptions: OutOfStockReplacementOption[];
};

export type PendingCustomerReplacementOrder = {
  order: Order;
  draftOrderId?: string;
  unavailableItemName: string;
  replacementOptions: OutOfStockReplacementOption[];
};

export type AppliedCustomerReplacementSelection = {
  order: Order;
  unavailableItemName: string;
  selectedReplacement: OutOfStockReplacementOption;
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
  const status: OrderStatus = "pending_restaurant_confirmation";

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
    rows: buildPendingAlert({
      conversationId: input.conversationId,
      draftOrderId: input.draft.id,
      orderId: created.id,
    }),
  });

  await client.insert({
    schema: input.schemaName,
    table: "app_events",
    rows: {
      conversation_id: input.conversationId,
      draft_order_id: input.draft.id,
      order_id: created.id,
      event_name: "order.pending_restaurant_confirmation_created",
      severity: "info",
      source: "order_service",
      metadata: {
        paymentMethod: input.draft.paymentMethod,
        fulfillmentType: input.draft.fulfillmentType,
      },
    },
  }).catch(() => undefined);

  return mapOrder(created);
}

export async function getPendingCustomerReplacementOrder(input: {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
  currentDraftOrderId?: string;
}): Promise<PendingCustomerReplacementOrder | undefined> {
  const context = await loadPendingCustomerReplacementOrderContext(input);

  if (!context) {
    return undefined;
  }

  return {
    order: mapOrder(context.order),
    draftOrderId: context.order.draft_order_id ?? undefined,
    unavailableItemName: context.unavailableOrderItem.name_snapshot,
    replacementOptions: context.replacementOptions,
  };
}

export async function applyCustomerReplacementSelection(input: {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
  currentDraftOrderId?: string;
  selectedReplacementMenuItemId: string;
}): Promise<AppliedCustomerReplacementSelection> {
  const context = await loadPendingCustomerReplacementOrderContext(input);

  if (!context) {
    throw new Error("order.customer_replacement_not_found");
  }

  const selectedReplacement = context.replacementOptions.find(
    (option) => option.menuItemId === input.selectedReplacementMenuItemId,
  );

  if (!selectedReplacement) {
    throw new Error("order.customer_replacement_option_not_found");
  }

  const client = createSupabaseRestClient(input.env);
  const [replacementMenuItem] = await client.select<MenuItemRow>({
    schema: input.schemaName,
    table: "menu_items",
    query: {
      select: "id,menu_id,product_id,combo_id,display_name,price_override,available_quantity,is_available,sort_order",
      id: `eq.${selectedReplacement.menuItemId}`,
      limit: 1,
    },
  });

  if (!replacementMenuItem?.is_available) {
    throw new Error("order.customer_replacement_menu_item_unavailable");
  }

  const [replacementProduct] =
    replacementMenuItem.product_id
      ? await client.select<ProductRow>({
          schema: input.schemaName,
          table: "products",
          query: {
            select: "id,name,base_price,category,is_active",
            id: `eq.${replacementMenuItem.product_id}`,
            limit: 1,
          },
        })
      : [];

  if (replacementMenuItem.product_id && !replacementProduct?.is_active) {
    throw new Error("order.customer_replacement_product_inactive");
  }

  const replacementName =
    replacementMenuItem.display_name ??
    replacementProduct?.name ??
    selectedReplacement.name;
  const replacementPrice =
    replacementMenuItem.price_override ??
    replacementProduct?.base_price ??
    selectedReplacement.price ??
    context.unavailableOrderItem.unit_price;
  const replacementCategory =
    replacementProduct?.category ??
    selectedReplacement.category ??
    context.unavailableOrderItem.category_snapshot ??
    undefined;
  const nextLineTotal = replacementPrice * context.unavailableOrderItem.quantity;
  const now = new Date().toISOString();

  const [updatedOrderItem] = await client.updateReturning<OrderItemRow>({
    schema: input.schemaName,
    table: "order_items",
    query: {
      id: `eq.${context.unavailableOrderItem.id}`,
    },
    patch: {
      menu_item_id: replacementMenuItem.id,
      product_id: replacementMenuItem.product_id ?? null,
      combo_id: replacementMenuItem.combo_id ?? null,
      category_snapshot: replacementCategory ?? null,
      name_snapshot: replacementName,
      unit_price: replacementPrice,
      options_snapshot: null,
      line_total: nextLineTotal,
    },
  });

  if (!updatedOrderItem) {
    throw new Error("order.customer_replacement_item_update_failed");
  }

  if (context.draftOrder?.id) {
    await replaceDraftOrderItemWithSelection({
      env: input.env,
      schemaName: input.schemaName,
      draftOrder: context.draftOrder,
      unavailableOrderItem: context.unavailableOrderItem,
      replacementMenuItem,
      replacementName,
      replacementPrice,
    });
  }

  const orderItems = await client.select<OrderItemRow>({
    schema: input.schemaName,
    table: "order_items",
    query: {
      select: "id,order_id,menu_item_id,product_id,combo_id,category_snapshot,name_snapshot,quantity,unit_price,options_snapshot,notes,line_total",
      order_id: `eq.${context.order.id}`,
    },
  });

  const subtotal = orderItems.reduce((sum, item) => sum + item.line_total, 0);
  const total = subtotal + context.order.delivery_fee - context.order.discount_total;
  const nextReviewMetadata = buildReplacementReviewMetadata({
    currentMetadata: context.order.restaurant_review_metadata,
    resolutionStatus: "customer_selected_replacement",
    selectedReplacement: {
      menuItemId: replacementMenuItem.id,
      productId: replacementMenuItem.product_id ?? undefined,
      comboId: replacementMenuItem.combo_id ?? undefined,
      category: replacementCategory,
      name: replacementName,
      price: replacementPrice,
    },
    at: now,
  });

  const [updatedOrder] = await client.updateReturning<OrderRow>({
    schema: input.schemaName,
    table: "orders",
    query: {
      id: `eq.${context.order.id}`,
    },
    patch: {
      status: "pending_restaurant_confirmation",
      subtotal,
      total,
      restaurant_review_metadata: nextReviewMetadata,
      updated_at: now,
    },
  });

  if (!updatedOrder) {
    throw new Error("order.customer_replacement_order_update_failed");
  }

  if (updatedOrder.draft_order_id ?? context.order.draft_order_id) {
    await client.insert({
      schema: input.schemaName,
      table: "human_intervention_alerts",
      rows: buildPendingAlert({
        conversationId: input.conversationId,
        draftOrderId: updatedOrder.draft_order_id ?? context.order.draft_order_id ?? undefined,
        orderId: updatedOrder.id,
        description: "El cliente eligio un reemplazo y el restaurante debe confirmar el ajuste.",
      }),
    }).catch(() => undefined);
  }

  await client.insert({
    schema: input.schemaName,
    table: "app_events",
    rows: {
      conversation_id: input.conversationId,
      draft_order_id: updatedOrder.draft_order_id ?? null,
      order_id: updatedOrder.id,
      event_name: "order.customer_replacement_selected",
      severity: "info",
      source: "message_router",
      metadata: {
        unavailableOrderItemId: context.unavailableOrderItem.id,
        selectedReplacement,
      },
    },
  }).catch(() => undefined);

  return {
    order: mapOrder(updatedOrder),
    unavailableItemName: context.unavailableOrderItem.name_snapshot,
    selectedReplacement: {
      menuItemId: replacementMenuItem.id,
      productId: replacementMenuItem.product_id ?? undefined,
      comboId: replacementMenuItem.combo_id ?? undefined,
      category: replacementCategory,
      name: replacementName,
      price: replacementPrice,
    },
  };
}

export async function cancelPendingCustomerReplacementOrder(input: {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
  currentDraftOrderId?: string;
}): Promise<Order> {
  const context = await loadPendingCustomerReplacementOrderContext(input);

  if (!context) {
    throw new Error("order.customer_replacement_not_found");
  }

  const client = createSupabaseRestClient(input.env);
  const now = new Date().toISOString();
  const nextReviewMetadata = buildReplacementReviewMetadata({
    currentMetadata: context.order.restaurant_review_metadata,
    resolutionStatus: "customer_cancelled",
    at: now,
  });
  const [updatedOrder] = await client.updateReturning<OrderRow>({
    schema: input.schemaName,
    table: "orders",
    query: {
      id: `eq.${context.order.id}`,
    },
    patch: {
      status: "cancelled",
      restaurant_review_metadata: nextReviewMetadata,
      updated_at: now,
    },
  });

  if (!updatedOrder) {
    throw new Error("order.customer_replacement_cancel_failed");
  }

  if (context.draftOrder?.id) {
    await client.update({
      schema: input.schemaName,
      table: "draft_orders",
      values: {
        status: "cancelled",
        updated_at: now,
      },
      query: {
        id: `eq.${context.draftOrder.id}`,
      },
    }).catch(() => undefined);
  }

  await client.insert({
    schema: input.schemaName,
    table: "app_events",
    rows: {
      conversation_id: input.conversationId,
      draft_order_id: updatedOrder.draft_order_id ?? null,
      order_id: updatedOrder.id,
      event_name: "order.customer_cancelled_after_out_of_stock",
      severity: "info",
      source: "message_router",
      metadata: {
        unavailableOrderItemId: context.unavailableOrderItem.id,
      },
    },
  }).catch(() => undefined);

  return mapOrder(updatedOrder);
}

function buildPendingAlert(input: {
  conversationId: string;
  draftOrderId?: string;
  orderId: string;
  description?: string;
}): Record<string, unknown> {
  return buildAlertRow({
    conversationId: input.conversationId,
    draftOrderId: input.draftOrderId,
    orderId: input.orderId,
    type: "order_pending_confirmation",
    title: "Pedido pendiente por confirmar",
    description: input.description ?? "El cliente ya confirmo el pedido y el restaurante debe revisarlo.",
  });
}

function buildAlertRow(input: {
  conversationId: string;
  draftOrderId?: string;
  orderId: string;
  type: HumanInterventionType;
  title: string;
  description: string;
}): Record<string, unknown> {
  return {
    conversation_id: input.conversationId,
    draft_order_id: input.draftOrderId ?? null,
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
    menu_item_id: item.menuItemId ?? null,
    product_id: item.productId ?? null,
    combo_id: item.comboId ?? null,
    category_snapshot: item.categorySnapshot ?? null,
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
    restaurantReviewedAt: row.restaurant_reviewed_at ?? undefined,
    restaurantReviewedBy: row.restaurant_reviewed_by ?? undefined,
    restaurantConfirmedAt: row.restaurant_confirmed_at ?? undefined,
    restaurantConfirmedBy: row.restaurant_confirmed_by ?? undefined,
    restaurantReviewNote: row.restaurant_review_note ?? undefined,
    restaurantReviewMetadata: row.restaurant_review_metadata ?? undefined,
    customerNotifiedAt: row.customer_notified_at ?? undefined,
    customerNotificationStatus: row.customer_notification_status ?? undefined,
    customerNotificationError: row.customer_notification_error ?? undefined,
    paymentConfirmedAt: row.payment_confirmed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadPendingCustomerReplacementOrderContext(input: {
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
        "id,draft_order_id,customer_id,location_id,status,fulfillment_type,service_timing,scheduled_for,delivery_address,delivery_address_id,payment_method,payment_proof_file_id,subtotal,delivery_fee,discount_total,total,restaurant_reviewed_at,restaurant_reviewed_by,restaurant_confirmed_at,restaurant_confirmed_by,restaurant_review_note,restaurant_review_metadata,customer_notified_at,customer_notification_status,customer_notification_error,payment_confirmed_at,created_at,updated_at",
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
              "id,conversation_id,customer_id,location_id,status,fulfillment_type,service_timing,scheduled_for,delivery_address,delivery_address_id,payment_method,subtotal,delivery_fee,discount_total,total,validation_errors,expires_at,created_at,updated_at",
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

  if (!unavailableOrderItem || replacementOptions.length === 0) {
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

function buildReplacementReviewMetadata(input: {
  currentMetadata?: Record<string, unknown> | null;
  resolutionStatus: "customer_selected_replacement" | "customer_cancelled";
  selectedReplacement?: OutOfStockReplacementOption;
  at: string;
}): Record<string, unknown> {
  return {
    ...(input.currentMetadata ?? {}),
    resolutionStatus: input.resolutionStatus,
    ...(input.selectedReplacement ? { selectedReplacementMenuItem: input.selectedReplacement } : {}),
    ...(input.selectedReplacement ? { selectedReplacementAt: input.at } : { customerCancelledAt: input.at }),
  };
}

async function replaceDraftOrderItemWithSelection(input: {
  env: ApiBindings;
  schemaName: string;
  draftOrder: DraftOrderRow;
  unavailableOrderItem: OrderItemRow;
  replacementMenuItem: MenuItemRow;
  replacementName: string;
  replacementPrice: number;
}): Promise<void> {
  const client = createSupabaseRestClient(input.env);
  const draftOrderItems = await client.select<DraftOrderItemRow>({
    schema: input.schemaName,
    table: "draft_order_items",
    query: {
      select: "id,draft_order_id,menu_item_id,product_id,combo_id,name_snapshot,quantity,unit_price,options_snapshot,notes,line_total",
      draft_order_id: `eq.${input.draftOrder.id}`,
    },
  });

  const matchingDraftOrderItem =
    draftOrderItems.find((item) => item.menu_item_id === input.unavailableOrderItem.menu_item_id) ??
    draftOrderItems.find((item) => item.product_id === input.unavailableOrderItem.product_id) ??
    draftOrderItems.find((item) => normalizeReplacementMatchText(item.name_snapshot) === normalizeReplacementMatchText(input.unavailableOrderItem.name_snapshot)) ??
    draftOrderItems[0];

  if (!matchingDraftOrderItem) {
    return;
  }

  await client.update({
    schema: input.schemaName,
    table: "draft_order_items",
    values: {
      menu_item_id: input.replacementMenuItem.id,
      product_id: input.replacementMenuItem.product_id ?? null,
      combo_id: input.replacementMenuItem.combo_id ?? null,
      name_snapshot: input.replacementName,
      unit_price: input.replacementPrice,
      options_snapshot: null,
      line_total: input.replacementPrice * matchingDraftOrderItem.quantity,
    },
    query: {
      id: `eq.${matchingDraftOrderItem.id}`,
    },
  });

  const recalculatedDraftItems = await client.select<DraftOrderItemRow>({
    schema: input.schemaName,
    table: "draft_order_items",
    query: {
      select: "id,draft_order_id,menu_item_id,product_id,combo_id,name_snapshot,quantity,unit_price,options_snapshot,notes,line_total",
      draft_order_id: `eq.${input.draftOrder.id}`,
    },
  });
  const subtotal = recalculatedDraftItems.reduce((sum, item) => sum + item.line_total, 0);
  const deliveryFee = input.draftOrder.fulfillment_type === "delivery" ? input.draftOrder.delivery_fee : 0;
  const total = subtotal + deliveryFee - input.draftOrder.discount_total;

  await client.update({
    schema: input.schemaName,
    table: "draft_orders",
    values: {
      subtotal,
      delivery_fee: deliveryFee,
      total,
      updated_at: new Date().toISOString(),
    },
    query: {
      id: `eq.${input.draftOrder.id}`,
    },
  });
}

function normalizeReplacementMatchText(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
