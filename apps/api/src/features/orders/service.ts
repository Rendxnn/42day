import type {
  BillingType,
  DraftOrder,
  Order,
  OrderLineItem,
  OrderLineItemOptionsSnapshot,
  OrderStatus,
  OutOfStockReplacementOption,
} from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { createSupabaseRestClient } from "../../lib/supabase-rest";
import { buildPendingAlert } from "./alerts";
import { mapLineItemToOrderItem, mapOrder } from "./mappers";
import { loadPendingCustomerReplacementOrderContext } from "./repository";
import { buildReplacementReviewMetadata, replaceDraftOrderItemWithSelection } from "./replacements";

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
  customer_address_text?: string | null;
  customer_latitude?: number | null;
  customer_longitude?: number | null;
  delivery_distance_km?: number | null;
  is_inside_delivery_coverage?: boolean | null;
  coverage_validation_method?: Order["coverageValidationMethod"] | null;
  coverage_confidence?: Order["coverageConfidence"] | null;
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
  options_snapshot?: OrderLineItemOptionsSnapshot | null;
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

  if (!input.draft.billing?.type) {
    throw new Error("order.confirmation_missing_billing");
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
      customer_address_text: input.draft.customerAddressText ?? input.draft.deliveryAddress ?? null,
      customer_latitude: input.draft.customerLatitude ?? null,
      customer_longitude: input.draft.customerLongitude ?? null,
      delivery_distance_km: input.draft.deliveryDistanceKm ?? null,
      is_inside_delivery_coverage: input.draft.isInsideDeliveryCoverage ?? null,
      coverage_validation_method: input.draft.coverageValidationMethod ?? "not_validated",
      coverage_confidence: input.draft.coverageConfidence ?? null,
      coverage_checked_at: input.draft.coverageCheckedAt ?? null,
      payment_method: input.draft.paymentMethod,
      billing_type: input.draft.billing.type,
      billing_profile_id: input.draft.billing.profileId ?? null,
      billing_full_name: input.draft.billing.fullName ?? null,
      billing_address: input.draft.billing.billingAddress ?? null,
      billing_legal_name: input.draft.billing.legalName ?? null,
      billing_tax_id: input.draft.billing.taxId ?? null,
      billing_email: input.draft.billing.email ?? null,
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

