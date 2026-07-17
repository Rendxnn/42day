import type {
  ConversationAutomation,
  DashboardNotificationRecord,
  OpenOrderSummary,
  OrderLineItem,
  OrdersBucket,
  OrderStatus,
  OrderSummary,
} from "@42day/types";
import { createSupabaseRestClient } from "../../../lib/supabase-rest.ts";
import type { ApiBindings } from "../../../lib/bindings";
import type {
  AppEventRow,
  ConversationRow,
  CustomerRow,
  DraftOrderItemRow,
  DraftOrderRow,
  LocationRow,
  MenuItemRow,
  OrderItemRow,
  OrderNotificationContext,
  OrderRow,
  ProductRow,
} from "../types";
import { formatCop } from "./date.ts";
import { resolveActiveMenuId, resolveMenuIdForMenuItem } from "./catalog.ts";

export function parseOrdersBucket(rawBucket?: string): OrdersBucket {
  if (rawBucket === "pending_confirmation" || rawBucket === "active" || rawBucket === "history" || rawBucket === "all") {
    return rawBucket;
  }

  return "pending_confirmation";
}

export function parsePositiveInt(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseOrderStatusFilter(rawStatus?: string): OrderStatus | undefined {
  if (!rawStatus) {
    return undefined;
  }

  return [
    "new",
    "pending_restaurant_confirmation",
    "needs_customer_replacement",
    "payment_pending_review",
    "accepted",
    "preparing",
    "on_the_way",
    "delivered",
    "cancelled",
  ].includes(rawStatus)
    ? (rawStatus as OrderStatus)
    : undefined;
}

export function matchesOrdersBucket(order: OrderSummary, bucket: OrdersBucket): boolean {
  if (bucket === "all") {
    return true;
  }

  if (bucket === "pending_confirmation") {
    return ["new", "pending_restaurant_confirmation", "needs_customer_replacement"].includes(order.status);
  }

  if (bucket === "active") {
    return ["accepted", "payment_pending_review", "preparing", "on_the_way"].includes(order.status);
  }

  return ["delivered", "cancelled"].includes(order.status);
}

export function isOpenDraftOrder(row: DraftOrderRow, conversation?: ConversationRow): boolean {
  if (["cancelled", "expired"].includes(row.status)) {
    return false;
  }

  if (conversation && ["completed", "expired"].includes(conversation.state)) {
    return false;
  }

  return true;
}

export function isOpenConversation(row: ConversationRow): boolean {
  if (["completed", "expired"].includes(row.state)) {
    return false;
  }

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return false;
  }

  return true;
}

export function mapOrderSummary(row: OrderRow, customer?: CustomerRow): OrderSummary {
  return {
    id: row.id,
    draftOrderId: row.draft_order_id ?? undefined,
    customerId: row.customer_id,
    customerPhone: customer?.phone,
    customerName: customer?.name,
    status: row.status,
    fulfillmentType: row.fulfillment_type,
    serviceTiming: row.service_timing ?? "asap",
    scheduledFor: row.scheduled_for ?? undefined,
    customerAddressText: row.customer_address_text ?? undefined,
    deliveryAddressDetails: row.delivery_address_details ?? undefined,
    resolvedDeliveryAddress: row.resolved_delivery_address ?? undefined,
    customerLatitude: row.customer_latitude ?? undefined,
    customerLongitude: row.customer_longitude ?? undefined,
    deliveryDistanceKm: row.delivery_distance_km ?? undefined,
    isInsideDeliveryCoverage: row.is_inside_delivery_coverage ?? undefined,
    coverageValidationMethod: row.coverage_validation_method ?? undefined,
    coverageConfidence: row.coverage_confidence ?? undefined,
    coverageCheckedAt: row.coverage_checked_at ?? undefined,
    paymentMethod: row.payment_method,
    billing: row.billing_type
      ? {
          type: row.billing_type,
          profileId: row.billing_profile_id ?? undefined,
          fullName: row.billing_full_name ?? undefined,
          billingAddress: row.billing_address ?? undefined,
          legalName: row.billing_legal_name ?? undefined,
          taxId: row.billing_tax_id ?? undefined,
          email: row.billing_email ?? undefined,
        }
      : undefined,
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
    whatsappUrl: customer?.phone ? buildWhatsAppUrl(customer.phone) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapOpenOrderSummary(
  row: DraftOrderRow,
  customer?: CustomerRow,
  conversation?: ConversationRow,
  items: DraftOrderItemRow[] = [],
  linkedOrder?: OrderRow,
): OpenOrderSummary {
  return {
    id: conversation?.id ?? row.id,
    draftOrderId: row.id,
    linkedOrderId: linkedOrder?.id,
    conversationId: row.conversation_id ?? conversation?.id ?? undefined,
    conversationState: conversation?.state,
    conversationAutomation: conversation ? mapConversationAutomation(conversation) : undefined,
    customerId: row.customer_id,
    customerPhone: customer?.phone,
    customerName: customer?.name,
    whatsappUrl: customer?.phone ? buildWhatsAppUrl(customer.phone) : undefined,
    status: row.status as OpenOrderSummary["status"],
    fulfillmentType: row.fulfillment_type ?? undefined,
    serviceTiming: row.service_timing ?? undefined,
    scheduledFor: row.scheduled_for ?? undefined,
    customerAddressText: row.customer_address_text ?? row.delivery_address ?? undefined,
    deliveryAddressDetails: row.delivery_address_details ?? undefined,
    resolvedDeliveryAddress: row.resolved_delivery_address ?? undefined,
    paymentMethod: row.payment_method ?? undefined,
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee,
    discountTotal: row.discount_total,
    total: row.total,
    validationErrors: row.validation_errors ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items.map(mapDraftOrderLineItem),
  };
}

export function mapOpenConversationSummary(
  row: ConversationRow,
  customer?: CustomerRow,
): OpenOrderSummary {
  return {
    id: row.id,
    conversationId: row.id,
    conversationState: row.state,
    conversationAutomation: mapConversationAutomation(row),
    customerId: row.customer_id,
    customerPhone: customer?.phone,
    customerName: customer?.name,
    whatsappUrl: customer?.phone ? buildWhatsAppUrl(customer.phone) : undefined,
    status: "conversation_started",
    subtotal: 0,
    deliveryFee: 0,
    discountTotal: 0,
    total: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: [],
  };
}

export function mapOrderSummaryAsOpenSummary(
  row: OrderSummary,
  conversation?: ConversationRow,
): OpenOrderSummary {
  return {
    id: conversation?.id ?? row.id,
    draftOrderId: row.draftOrderId,
    linkedOrderId: row.id,
    conversationId: conversation?.id ?? row.conversationId,
    conversationState: conversation?.state,
    conversationAutomation: conversation ? mapConversationAutomation(conversation) : undefined,
    customerId: row.customerId,
    customerPhone: row.customerPhone,
    customerName: row.customerName,
    whatsappUrl: row.whatsappUrl,
    status: row.status,
    fulfillmentType: row.fulfillmentType,
    serviceTiming: row.serviceTiming,
    scheduledFor: row.scheduledFor,
    customerAddressText: row.customerAddressText,
    deliveryAddressDetails: row.deliveryAddressDetails,
    resolvedDeliveryAddress: row.resolvedDeliveryAddress,
    paymentMethod: row.paymentMethod,
    subtotal: row.subtotal,
    deliveryFee: row.deliveryFee,
    discountTotal: row.discountTotal,
    total: row.total,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items,
  };
}

export function mapConversationAutomation(row: ConversationRow): ConversationAutomation {
  const terminal = ["completed", "expired"].includes(row.state);
  return {
    conversationId: row.id,
    enabled: row.automation_enabled ?? true,
    effectiveEnabled: !terminal && (row.automation_enabled ?? true),
    state: row.state as ConversationAutomation["state"],
    resumeState: row.automation_resume_state as ConversationAutomation["resumeState"],
    manualReason: row.manual_reason ?? undefined,
    changedAt: row.automation_changed_at ?? undefined,
    changedBy: row.automation_changed_by ?? undefined,
    changeReason: row.automation_change_reason ?? undefined,
    updatedAt: row.updated_at,
    terminal,
  };
}

export function mapOrderLineItem(row: OrderItemRow): OrderLineItem {
  return {
    id: row.id,
    menuItemId: row.menu_item_id ?? undefined,
    productId: row.product_id ?? undefined,
    comboId: row.combo_id ?? undefined,
    categorySnapshot: row.category_snapshot ?? undefined,
    name: row.name_snapshot,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    options: row.options_snapshot ?? undefined,
    notes: row.notes ?? undefined,
    lineTotal: row.line_total,
  };
}

export function mapDraftOrderLineItem(row: DraftOrderItemRow): OrderLineItem {
  return {
    id: row.id,
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

export function mapDashboardNotification(row: AppEventRow, context?: {
  customer?: CustomerRow;
  draftOrder?: DraftOrderRow;
  order?: OrderRow;
}): DashboardNotificationRecord {
  const customerLabel = context?.customer?.name?.trim()
    || context?.customer?.phone
    || "Cliente sin nombre";
  const total = context?.order?.total ?? context?.draftOrder?.total;

  return {
    id: row.id,
    title: getNotificationTitle(row.event_name),
    detail: `${customerLabel}${total !== undefined ? ` - ${formatCop(total)}` : ""}`,
    createdAt: row.created_at,
    orderId: row.order_id ?? undefined,
    draftOrderId: row.draft_order_id ?? undefined,
    conversationId: row.conversation_id ?? undefined,
    whatsappUrl: context?.customer?.phone ? buildWhatsAppUrl(context.customer.phone) : undefined,
    severity: row.severity,
    eventName: row.event_name,
  };
}

export function buildWhatsAppUrl(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}

export async function loadOrderNotificationContext(
  env: ApiBindings,
  schema: string,
  orderId: string,
): Promise<OrderNotificationContext | undefined> {
  const supabase = createSupabaseRestClient(env);
  const [order] = await supabase.select<OrderRow>({
    schema,
    table: "orders",
    query: {
      select:
        "id,draft_order_id,customer_id,location_id,status,fulfillment_type,service_timing,scheduled_for,delivery_address,delivery_address_details,delivery_address_id,customer_address_text,resolved_delivery_address,customer_latitude,customer_longitude,delivery_distance_km,is_inside_delivery_coverage,coverage_validation_method,coverage_confidence,coverage_checked_at,payment_method,payment_proof_file_id,billing_type,billing_profile_id,billing_full_name,billing_address,billing_legal_name,billing_tax_id,billing_email,subtotal,delivery_fee,discount_total,total,restaurant_reviewed_at,restaurant_reviewed_by,restaurant_confirmed_at,restaurant_confirmed_by,restaurant_review_note,restaurant_review_metadata,customer_notified_at,customer_notification_status,customer_notification_error,payment_confirmed_at,created_at,updated_at",
      id: `eq.${orderId}`,
      limit: 1,
    },
  });

  if (!order) {
    return undefined;
  }

  const [customer, draftOrder, location] = await Promise.all([
    supabase.select<CustomerRow>({
      schema,
      table: "customers",
      query: {
        select: "id,phone,name",
        id: `eq.${order.customer_id}`,
        limit: 1,
      },
    }),
    order.draft_order_id
      ? supabase.select<DraftOrderRow>({
          schema,
          table: "draft_orders",
          query: {
            select: "id,conversation_id",
            id: `eq.${order.draft_order_id}`,
            limit: 1,
          },
        })
      : Promise.resolve([]),
    order.location_id
      ? supabase.select<LocationRow>({
          schema,
          table: "locations",
          query: {
            select: "id,name,address,phone,delivery_fee_fixed,automation_enabled,is_active",
            id: `eq.${order.location_id}`,
            limit: 1,
          },
        })
      : Promise.resolve([]),
  ]);

  if (!customer[0]) {
    throw new Error("order.customer_not_found");
  }

  return {
    order,
    customer: customer[0],
    draftOrder: draftOrder[0],
    location: location[0],
  };
}

export async function resolvePendingConfirmationAlerts(env: ApiBindings, schema: string, orderId: string): Promise<void> {
  await createSupabaseRestClient(env).update({
    schema,
    table: "human_intervention_alerts",
    values: {
      status: "resolved",
      resolved_at: new Date().toISOString(),
    },
    query: {
      order_id: `eq.${orderId}`,
      type: "eq.order_pending_confirmation",
      status: "in.(open,acknowledged)",
    },
  });
}

export async function resolveReplacementOptions(input: {
  env: ApiBindings;
  schemaName: string;
  tenantTimezone?: string;
  orderItem: OrderItemRow;
  requestedReplacementMenuItemIds: string[];
}): Promise<Array<{
  menuItemId: string;
  productId?: string;
  comboId?: string;
  category?: string;
  name: string;
  price?: number;
}>> {
  const supabase = createSupabaseRestClient(input.env);
  const activeMenuId = input.orderItem.menu_item_id
    ? await resolveMenuIdForMenuItem(supabase, input.schemaName, input.orderItem.menu_item_id)
    : await resolveActiveMenuId(supabase, input.schemaName, input.tenantTimezone);

  if (!activeMenuId) {
    return [];
  }

  const menuItems = await supabase.select<MenuItemRow>({
    schema: input.schemaName,
    table: "menu_items",
    query: {
      select: "id,menu_id,product_id,combo_id,display_name,price_override,available_quantity,is_available,sort_order",
      menu_id: `eq.${activeMenuId}`,
      is_available: "eq.true",
      order: "sort_order.asc",
      limit: 100,
    },
  });

  const candidateMenuItems = input.requestedReplacementMenuItemIds.length > 0
    ? menuItems.filter((item) => input.requestedReplacementMenuItemIds.includes(item.id))
    : menuItems;
  const productIds = candidateMenuItems
    .map((item) => item.product_id)
    .filter((value): value is string => Boolean(value));
  const productById = new Map<string, ProductRow>();

  if (productIds.length > 0) {
    const products = await supabase.select<ProductRow>({
      schema: input.schemaName,
      table: "products",
      query: {
        select: "id,name,description,base_price,category,emoji,image_url,is_active",
        id: `in.(${productIds.join(",")})`,
        is_active: "eq.true",
        limit: productIds.length,
      },
    });

    for (const product of products) {
      productById.set(product.id, product);
    }
  }

  const targetCategory = await resolveOrderItemTargetCategory({
    supabase,
    schemaName: input.schemaName,
    orderItem: input.orderItem,
    productById,
  });
  const normalizedTargetCategory = normalizeCategoryKey(targetCategory);

  const replacements: Array<{
    menuItemId: string;
    productId?: string;
    comboId?: string;
    category?: string;
    name: string;
    price?: number;
  }> = [];

  for (const item of candidateMenuItems) {
    if (item.id === input.orderItem.menu_item_id) {
      continue;
    }

    if (item.product_id && input.orderItem.product_id && item.product_id === input.orderItem.product_id) {
      continue;
    }

    if (item.combo_id && input.orderItem.combo_id && item.combo_id === input.orderItem.combo_id) {
      continue;
    }

    const product = item.product_id ? productById.get(item.product_id) : undefined;
    const category = product?.category;

    if (input.requestedReplacementMenuItemIds.length === 0 && normalizedTargetCategory && normalizeCategoryKey(category) !== normalizedTargetCategory) {
      continue;
    }

    const name = item.display_name ?? product?.name ?? "Producto disponible";
    if (!name) {
      continue;
    }

    replacements.push({
      menuItemId: item.id,
      productId: item.product_id ?? undefined,
      comboId: item.combo_id ?? undefined,
      category,
      name,
      price: item.price_override ?? product?.base_price,
    });
  }

  return replacements.slice(0, 3);
}

function getNotificationTitle(eventName: string) {
  if (eventName === "order.pending_restaurant_confirmation_created") return "Nuevo pedido por confirmar";
  if (eventName === "whatsapp.customer_notification_failed") return "Fallo al notificar por WhatsApp";
  if (eventName === "whatsapp.customer_notification_sent") return "WhatsApp enviado al cliente";
  if (eventName === "order.payment_pending_review") return "Comprobante pendiente de revision";
  if (eventName === "order.payment_confirmed") return "Pago confirmado";
  if (eventName === "order.customer_replacement_selected") return "Cliente eligio reemplazo";
  if (eventName === "order.cancelled_by_restaurant") return "Pedido cancelado por restaurante";
  return "Movimiento del pedido";
}

async function resolveOrderItemTargetCategory(input: {
  supabase: ReturnType<typeof createSupabaseRestClient>;
  schemaName: string;
  orderItem: {
    category_snapshot?: string | null;
    product_id?: string | null;
    menu_item_id?: string | null;
  };
  productById: Map<string, ProductRow>;
}) {
  if (input.orderItem.category_snapshot) {
    return input.orderItem.category_snapshot;
  }

  if (input.orderItem.product_id) {
    const cachedProduct = input.productById.get(input.orderItem.product_id);
    if (cachedProduct?.category) {
      return cachedProduct.category;
    }

    const [product] = await input.supabase.select<ProductRow>({
      schema: input.schemaName,
      table: "products",
      query: {
        select: "id,name,description,base_price,category,emoji,image_url,is_active",
        id: `eq.${input.orderItem.product_id}`,
        limit: 1,
      },
    });

    if (product?.category) {
      return product.category;
    }
  }

  if (input.orderItem.menu_item_id) {
    const [menuItem] = await input.supabase.select<MenuItemRow>({
      schema: input.schemaName,
      table: "menu_items",
      query: {
        select: "id,menu_id,product_id,combo_id,display_name,price_override,available_quantity,is_available,sort_order",
        id: `eq.${input.orderItem.menu_item_id}`,
        limit: 1,
      },
    });

    if (menuItem?.product_id) {
      const cachedProduct = input.productById.get(menuItem.product_id);
      if (cachedProduct?.category) {
        return cachedProduct.category;
      }
    }
  }

  return undefined;
}

function normalizeCategoryKey(value?: string | null) {
  const normalized = (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  if (normalized.length <= 4) return normalized;
  if (normalized.endsWith("ces")) return `${normalized.slice(0, -3)}z`;
  if (normalized.endsWith("s")) return normalized.slice(0, -1);
  return normalized;
}
