import { Hono } from "hono";
import { adminDashboardRoutes } from "./routes/admin";
import { publicCartaRoutes } from "./routes/public-carta";
import { alertsDashboardRoutes } from "./routes/alerts";
import { ordersDashboardRoutes } from "./routes/orders";
import { uploadsDashboardRoutes } from "./routes/uploads";
import { settingsDashboardRoutes } from "./routes/settings";
import { menuDashboardRoutes } from "./routes/menu";
import { diagnosticsDashboardRoutes } from "./routes/diagnostics";
import { catalogDashboardRoutes } from "./routes/catalog";
import type {
  AcceptOrderRequest,
  AutomationSettings,
  HumanInterventionAlert,
  HumanInterventionStatus,
  Menu,
  MenuItem,
  OrderCustomerNotificationType,
  OrderDetail,
  OrderLineItem,
  OrdersBucket,
  OrdersDashboardPayload,
  OrderStatus,
  OrderSummary,
  Product,
  PublicCartaPayload,
  RejectOutOfStockOrderRequest,
  RetryOrderCustomerNotificationRequest,
  TodayMenuPayload,
} from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { createSupabaseRestClient, SupabaseRestError } from "../../lib/supabase-rest";
import { updateConversationState } from "../../modules/conversation-service/conversation-service";
import { logOutboundTextMessage } from "../../modules/message-log/message-log";
import { sendWhatsAppTextMessage } from "../../modules/whatsapp-webhook/whatsapp-client";
import { isMissingTableError } from "../../shared/errors/supabase";
import {
  confirmLatestPaymentProofForOrder,
  downloadLatestPaymentProofForOrder,
  getLatestPaymentProofForOrder,
} from "../payment-proofs/service";
import { getAuthorizedTenants, getTenantUserRole, isSystemAdmin, requireAuthUser, tenantAccessMiddleware } from "./auth";
import type {
  AdminAuthUser,
  AlertRow,
  AuthUser,
  CustomerRow,
  DashboardVariables,
  DraftOrderRow,
  GeminiMenuProduct,
  LocationRow,
  MenuItemRow,
  MenuRow,
  OrderItemRow,
  OrderNotificationContext,
  OrderRow,
  PaymentProofRow,
  ProductOptionRow,
  ProductOptionValueRow,
  ProductRow,
  TenantRow,
  TenantStatus,
  TenantUserRow,
} from "./types";

export const dashboardRoutes = new Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>();

dashboardRoutes.route("/", adminDashboardRoutes);

dashboardRoutes.route("/", publicCartaRoutes);

dashboardRoutes.use("/:tenantSlug/*", tenantAccessMiddleware);

dashboardRoutes.route("/", ordersDashboardRoutes);

dashboardRoutes.route("/", alertsDashboardRoutes);

dashboardRoutes.route("/", settingsDashboardRoutes);

dashboardRoutes.route("/", catalogDashboardRoutes);

dashboardRoutes.route("/", uploadsDashboardRoutes);

dashboardRoutes.route("/", diagnosticsDashboardRoutes);

dashboardRoutes.route("/", menuDashboardRoutes);

export async function findOrCreateTodayMenu(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  timezone?: string,
  requestedDate?: string,
): Promise<MenuRow> {
  const date = resolveBusinessDate(requestedDate, timezone);
  const [location] = await supabase.select<LocationRow>({
    schema,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  if (!location) {
    throw new Error("active_location_not_found");
  }

  const [existing] = await supabase.select<MenuRow>({
    schema,
    table: "menus",
    query: {
      select: "id,location_id,date,name,status,published_at",
      location_id: `eq.${location.id}`,
      date: `eq.${date}`,
      limit: 1,
    },
  });

  if (existing) {
    return existing;
  }

  const [menu] = await supabase.insertReturning<MenuRow>({
    schema,
    table: "menus",
    rows: {
      location_id: location.id,
      date,
      name: "Menu de hoy",
      status: "published",
      published_at: new Date().toISOString(),
    },
  });

  if (!menu) {
    throw new Error("menu_create_failed");
  }

  return menu;
}

export function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

export function parseGeminiMenuProducts(text: string): GeminiMenuProduct[] {
  const normalized = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(normalized) as { products?: unknown[] };

  return (parsed.products ?? [])
    .map((entry) => {
      const product = entry as Partial<GeminiMenuProduct>;
      return {
        name: String(product.name ?? "").trim(),
        description: product.description ? String(product.description).trim() : undefined,
        basePrice: Number(product.basePrice ?? 0),
        category: product.category ? String(product.category).trim() : undefined,
        confidence: product.confidence === undefined ? undefined : Number(product.confidence),
      };
    })
    .filter((product) => product.name && Number.isFinite(product.basePrice) && product.basePrice > 0)
    .slice(0, 30);
}

export async function selectProducts(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  query: Record<string, string | number | boolean | undefined> = {},
): Promise<ProductRow[]> {
  try {
    return await supabase.select<ProductRow>({
      schema,
      table: "products",
      query: {
        select: "id,name,description,base_price,category,emoji,product_type,image_url,is_active",
        order: "name.asc",
        is_active: "eq.true",
        ...query,
      },
    });
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 400 && (error.body.includes("image_url") || error.body.includes("emoji"))) {
      return supabase.select<ProductRow>({
        schema,
        table: "products",
        query: {
          select: "id,name,description,base_price,category,is_active",
          order: "name.asc",
          is_active: "eq.true",
          ...query,
        },
      });
    }

    throw error;
  }
}

export async function getNextMenuSortOrder(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  menuId: string,
): Promise<number> {
  const [lastItem] = await supabase.select<Pick<MenuItemRow, "sort_order">>({
    schema,
    table: "menu_items",
    query: {
      select: "sort_order",
      menu_id: `eq.${menuId}`,
      order: "sort_order.desc",
      limit: 1,
    },
  });

  return (lastItem?.sort_order ?? 0) + 10;
}

export async function selectProductOptions(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  productIds: string[],
): Promise<Map<string, Product["options"]>> {
  const optionsByProductId = new Map<string, Product["options"]>();
  if (productIds.length === 0) return optionsByProductId;

  let optionRows: ProductOptionRow[] = [];

  try {
    optionRows = await supabase.select<ProductOptionRow>({
      schema,
      table: "product_options",
      query: {
        select: "id,product_id,name,description,type,is_required,min_select,max_select,sort_order,display_mode",
        product_id: `in.(${productIds.join(",")})`,
        order: "sort_order.asc",
      },
    });
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404) return optionsByProductId;
    throw error;
  }

  const optionIds = optionRows.map((option) => option.id);
  const valuesByOptionId = new Map<string, ProductOptionValueRow[]>();

  if (optionIds.length > 0) {
    const valueRows = await supabase.select<ProductOptionValueRow>({
      schema,
      table: "product_option_values",
      query: {
        select: "id,option_id,name,description,price_delta,is_active,sort_order",
        option_id: `in.(${optionIds.join(",")})`,
        order: "sort_order.asc",
      },
    });

    valueRows.forEach((value) => {
      const values = valuesByOptionId.get(value.option_id) ?? [];
      values.push(value);
      valuesByOptionId.set(value.option_id, values);
    });
  }

  optionRows.forEach((option) => {
    const values = valuesByOptionId.get(option.id) ?? [];
    const mappedOptions = optionsByProductId.get(option.product_id) ?? [];
    mappedOptions.push({
      id: option.id,
      name: option.name,
      description: option.description ?? undefined,
      type: option.type,
      isRequired: option.is_required,
      minSelect: option.min_select,
      maxSelect: option.max_select,
      sortOrder: option.sort_order ?? 0,
      displayMode: option.display_mode ?? "list",
      values: values.map((value) => ({
        id: value.id,
        name: value.name,
        description: value.description ?? undefined,
        priceDelta: value.price_delta,
        isActive: value.is_active,
        sortOrder: value.sort_order ?? 0,
      })),
    });
    optionsByProductId.set(option.product_id, mappedOptions);
  });

  return optionsByProductId;
}

export async function replaceProductOptions(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  productId: string,
  options: Product["options"] = [],
) {
  const existingOptions = await supabase.select<ProductOptionRow>({
    schema,
    table: "product_options",
    query: {
      select: "id,product_id,name,type,is_required,min_select,max_select",
      product_id: `eq.${productId}`,
    },
  });

  for (const option of existingOptions) {
    await supabase.delete({
      schema,
      table: "product_option_values",
      query: { option_id: `eq.${option.id}` },
    });
  }

  await supabase.delete({
    schema,
    table: "product_options",
    query: { product_id: `eq.${productId}` },
  });

  const optionRows = (options ?? [])
    .filter((option) => option.name.trim())
    .map((option, index) => ({
      product_id: productId,
      name: option.name.trim(),
      description: option.description?.trim() || null,
      type: option.type,
      is_required: option.isRequired,
      min_select: option.minSelect,
      max_select: option.maxSelect,
      sort_order: option.sortOrder ?? index * 10,
      display_mode: option.displayMode ?? "list",
    }));

  if (optionRows.length === 0) return;

  const insertedOptions = await supabase.insertReturning<ProductOptionRow>({
    schema,
    table: "product_options",
    rows: optionRows,
  });

  const valueRows = insertedOptions.flatMap((insertedOption, optionIndex) => {
    const sourceOption = options[optionIndex];
    return (sourceOption?.values ?? [])
      .filter((value) => value.name.trim())
      .map((value, valueIndex) => ({
        option_id: insertedOption.id,
        name: value.name.trim(),
        description: value.description?.trim() || null,
        price_delta: value.priceDelta ?? 0,
        is_active: value.isActive ?? true,
        sort_order: value.sortOrder ?? valueIndex * 10,
      }));
  });

  if (valueRows.length > 0) {
    await supabase.insert({
      schema,
      table: "product_option_values",
      rows: valueRows,
    });
  }
}

export async function selectAlerts(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  options: {
    status?: HumanInterventionStatus;
    limit?: number;
  } = {},
): Promise<AlertRow[]> {
  return supabase.select<AlertRow>({
    schema,
    table: "human_intervention_alerts",
    query: {
      select: "id,conversation_id,draft_order_id,order_id,type,status,title,description,metadata,created_at,resolved_at",
      ...(options.status ? { status: `eq.${options.status}` } : {}),
      order: "created_at.desc",
      limit: options.limit ?? 100,
    },
  });
}

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
    paymentMethod: row.payment_method,
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

export function mapAlert(row: AlertRow): HumanInterventionAlert {
  return {
    id: row.id,
    conversationId: row.conversation_id ?? undefined,
    draftOrderId: row.draft_order_id ?? undefined,
    orderId: row.order_id ?? undefined,
    type: row.type as HumanInterventionAlert["type"],
    status: row.status,
    title: row.title,
    description: row.description ?? undefined,
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
  };
}

export function mapLocation(row: LocationRow) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    deliveryFeeFixed: row.delivery_fee_fixed,
    isActive: row.is_active,
  };
}

export function mapProduct(row: ProductRow, options?: Product["options"]): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    basePrice: row.base_price,
    category: row.category,
    emoji: row.emoji ?? undefined,
    imageUrl: row.image_url,
    productType: row.product_type ?? "simple",
    options: options ?? [],
    isActive: row.is_active,
  };
}

export function mapMenu(row: MenuRow): Menu {
  return {
    id: row.id,
    locationId: row.location_id,
    date: row.date,
    name: row.name,
    status: row.status,
    publishedAt: row.published_at,
  };
}

export function mapMenuItem(row: MenuItemRow, product?: Product): MenuItem {
  return {
    id: row.id,
    menuId: row.menu_id,
    productId: row.product_id,
    comboId: row.combo_id,
    displayName: row.display_name,
    priceOverride: row.price_override,
    availableQuantity: row.available_quantity,
    isAvailable: row.is_available,
    sortOrder: row.sort_order,
    product,
  };
}

export function resolveBusinessDate(requestedDate?: string, timezone = "America/Bogota"): string {
  if (requestedDate) {
    return requestedDate;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date().toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
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
        "id,draft_order_id,customer_id,location_id,status,fulfillment_type,service_timing,scheduled_for,delivery_address,delivery_address_id,payment_method,payment_proof_file_id,subtotal,delivery_fee,discount_total,total,restaurant_reviewed_at,restaurant_reviewed_by,restaurant_confirmed_at,restaurant_confirmed_by,restaurant_review_note,restaurant_review_metadata,customer_notified_at,customer_notification_status,customer_notification_error,payment_confirmed_at,created_at,updated_at",
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
            select: "id,name,address,phone,delivery_fee_fixed,transfer_payment_instructions,automation_enabled,is_active",
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

export function buildAcceptedOrderMessage(order: OrderRow, location?: LocationRow): string {
  if (order.payment_method === "transfer") {
    const instructions = location?.transfer_payment_instructions?.trim();
    return [
      `¡Gracias! Tu pedido ${order.id.slice(0, 8)} ya fue confirmado por el restaurante. 🙌`,
      instructions
        ? `Puedes hacer la transferencia con estos datos:\n${instructions}\n\nCuando la realices, envíame el comprobante por aquí y con gusto continuamos.`
        : "Puedes hacer la transferencia y, cuando la realices, envíame el comprobante por aquí para continuar con tu pedido.",
    ].join("\n\n");
  }

  return [
    `¡Gracias! Tu pedido ${order.id.slice(0, 8)} ya fue confirmado por el restaurante. 🙌`,
    "Ya lo estamos preparando. Si surge alguna novedad, te escribiré por aquí.",
  ].join("\n\n");
}

export function buildOutOfStockMessage(itemName: string, replacementOptions: Array<{
  name: string;
  price?: number;
}>): string {
  const replacementLines = replacementOptions
    .slice(0, 3)
    .map((option, index) => `${index + 1}. ${option.name}${option.price !== undefined ? ` — ${formatCop(option.price)}` : ""}`);

  return [
    `Lo siento mucho, en este momento no tenemos ${itemName}.`,
    "Si quieres, puedes elegir una de estas opciones similares:",
    replacementLines.join("\n"),
    'Respóndeme con el número de la opción que prefieras o escribe "cancelar" si prefieres no continuar con ese pedido.',
  ].join("\n\n");
}

export function buildRetryNotificationMessage(
  type: OrderCustomerNotificationType,
  order: OrderRow,
  location?: LocationRow,
): string | null {
  if (type === "accepted") {
    return buildAcceptedOrderMessage(order, location);
  }

  if (type === "out_of_stock") {
    const metadata = order.restaurant_review_metadata ?? {};
    const unavailableItems = Array.isArray(metadata.unavailableItems) ? metadata.unavailableItems : [];
    const replacementMenuItems = Array.isArray(metadata.replacementMenuItems) ? metadata.replacementMenuItems : [];
    const unavailableName =
      unavailableItems[0] && typeof unavailableItems[0] === "object" && "name" in unavailableItems[0]
        ? String(unavailableItems[0].name)
        : null;
    const replacements: Array<{ name: string; price?: number }> = [];
    for (const item of replacementMenuItems) {
      if (!item || typeof item !== "object" || !("name" in item) || !item.name) {
        continue;
      }

      replacements.push({
        name: String(item.name),
        price: "price" in item && item.price !== undefined ? Number(item.price) : undefined,
      });
    }

    if (!unavailableName || replacements.length === 0) {
      return null;
    }

    return buildOutOfStockMessage(unavailableName, replacements);
  }

  return null;
}

export async function sendOrderCustomerNotification(input: {
  env: ApiBindings;
  schemaName: string;
  context: OrderNotificationContext;
  messageText: string;
  notificationType: OrderCustomerNotificationType;
}): Promise<OrderRow> {
  const result = await sendWhatsAppTextMessage(input.env, {
    to: input.context.customer.phone,
    text: input.messageText,
  });
  const now = new Date().toISOString();
  const notificationStatus = result.providerMessageId ? "sent" : "failed";
  const [updatedOrder] = await createSupabaseRestClient(input.env).updateReturning<OrderRow>({
    schema: input.schemaName,
    table: "orders",
    query: {
      id: `eq.${input.context.order.id}`,
    },
    patch: {
      customer_notified_at: result.providerMessageId ? now : null,
      customer_notification_status: notificationStatus,
      customer_notification_error: result.providerMessageId ? null : `notification_${input.notificationType}_failed`,
      updated_at: now,
    },
  });

  if (input.context.draftOrder?.conversation_id) {
    await logOutboundTextMessage({
      env: input.env,
      schemaName: input.schemaName,
      conversationId: input.context.draftOrder.conversation_id,
      text: input.messageText,
      result,
      metadata: {
        order: {
          orderId: input.context.order.id,
          notificationType: input.notificationType,
          source: "dashboard_api",
        },
      },
    }).catch(() => undefined);
  }

  await createSupabaseRestClient(input.env).insert({
    schema: input.schemaName,
    table: "app_events",
    rows: {
      conversation_id: input.context.draftOrder?.conversation_id ?? null,
      draft_order_id: input.context.order.draft_order_id ?? null,
      order_id: input.context.order.id,
      event_name: result.providerMessageId ? "whatsapp.customer_notification_sent" : "whatsapp.customer_notification_failed",
      severity: result.providerMessageId ? "info" : "warn",
      source: "dashboard_api",
      metadata: {
        notificationType: input.notificationType,
        providerMessageId: result.providerMessageId ?? null,
      },
    },
  }).catch(() => undefined);

  return updatedOrder ?? input.context.order;
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

export async function resolveMenuIdForMenuItem(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  menuItemId: string,
): Promise<string | undefined> {
  const [menuItem] = await supabase.select<Pick<MenuItemRow, "menu_id">>({
    schema,
    table: "menu_items",
    query: {
      select: "menu_id",
      id: `eq.${menuItemId}`,
      limit: 1,
    },
  });

  return menuItem?.menu_id;
}

export async function resolveActiveMenuId(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  timezone?: string,
): Promise<string | undefined> {
  const [location] = await supabase.select<LocationRow>({
    schema,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,transfer_payment_instructions,automation_enabled,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  if (!location) {
    return undefined;
  }

  const [menu] = await supabase.select<MenuRow>({
    schema,
    table: "menus",
    query: {
      select: "id,location_id,date,name,status,published_at",
      location_id: `eq.${location.id}`,
      date: `eq.${resolveBusinessDate(undefined, timezone)}`,
      status: "eq.published",
      limit: 1,
    },
  });

  return menu?.id;
}

export function formatCop(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function normalizeTenantSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function buildDefaultRestaurantPassword(slug: string): string {
  const base = slug.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "restaurante";
  return `${base}_42*password`;
}

type AdminRestaurantMetrics = {
  activeProductCount: number;
  todayMenuItemCount: number;
  ordersTodayCount: number;
  pendingOrderCount: number;
  completedTodayCount: number;
  revenueToday: number;
  lastOrderAt?: string;
};

type AdminTenantSnapshot = {
  location?: LocationRow | null;
  metrics?: AdminRestaurantMetrics | null;
};

export function mapAdminRestaurant(
  tenant: TenantRow,
  location?: LocationRow,
  members: ReturnType<typeof mapAdminMember>[] = [],
  metrics?: AdminRestaurantMetrics,
) {
  return {
    id: tenant.id,
    name: tenant.name ?? tenant.slug,
    slug: tenant.slug,
    schemaName: tenant.schema_name,
    status: tenant.status ?? "active",
    timezone: tenant.timezone ?? "America/Bogota",
    currency: tenant.currency ?? "COP",
    automationEnabled: tenant.automation_enabled ?? true,
    createdAt: tenant.created_at,
    updatedAt: tenant.updated_at,
    cartaUrlPath: `/carta?tenant=${tenant.slug}`,
    defaultPassword: buildDefaultRestaurantPassword(tenant.slug),
    location: location ? {
      id: location.id,
      name: location.name,
      address: location.address,
      phone: location.phone,
      deliveryFeeFixed: location.delivery_fee_fixed,
      pickupEnabled: location.pickup_enabled ?? true,
      deliveryEnabled: location.delivery_enabled ?? true,
      automationEnabled: location.automation_enabled ?? true,
      transferPaymentInstructions: location.transfer_payment_instructions ?? undefined,
      isActive: location.is_active,
    } : undefined,
    members,
    metrics: metrics ?? {
      activeProductCount: 0,
      todayMenuItemCount: 0,
      ordersTodayCount: 0,
      pendingOrderCount: 0,
      completedTodayCount: 0,
      revenueToday: 0,
    },
  };
}

export function mapAdminMember(row: TenantUserRow, user?: AdminAuthUser) {
  return {
    userId: row.user_id,
    email: user?.email,
    name: user?.user_metadata?.name ?? user?.user_metadata?.username,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    lastSignInAt: user?.last_sign_in_at ?? undefined,
  };
}

export async function listAdminRestaurants(env: ApiBindings) {
  const supabase = createSupabaseRestClient(env);
  const tenants = await supabase.select<TenantRow>({
    schema: "control",
    table: "tenants",
    query: {
      select: "id,name,slug,schema_name,status,timezone,currency,automation_enabled,created_at,updated_at",
      slug: "neq.thaledon",
      order: "created_at.desc",
    },
  });
  const tenantIds = tenants.map((tenant) => tenant.id);
  const tenantUsers = tenantIds.length > 0
    ? await supabase.select<TenantUserRow>({
        schema: "control",
        table: "tenant_users",
        query: {
          select: "tenant_id,user_id,role,status,created_at",
          tenant_id: `in.(${tenantIds.join(",")})`,
          order: "created_at.asc",
        },
      })
    : [];
  const uniqueUserIds = Array.from(new Set(tenantUsers.map((row) => row.user_id)));
  const authUsers = await Promise.all(uniqueUserIds.map((userId) => getAuthAdminUser(env, userId).catch(() => undefined)));
  const authUserById = new Map(authUsers.filter((user): user is AdminAuthUser => Boolean(user)).map((user) => [user.id, user]));

  const restaurants = await Promise.all(tenants.map(async (tenant) => {
    const snapshot = await getAdminTenantSnapshot(supabase, tenant);

    return mapAdminRestaurant(
      tenant,
      snapshot.location ?? undefined,
      tenantUsers
        .filter((row) => row.tenant_id === tenant.id)
        .map((row) => mapAdminMember(row, authUserById.get(row.user_id))),
      snapshot.metrics ?? undefined,
    );
  }));

  return restaurants;
}

export async function getAdminTenantSnapshot(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  tenant: TenantRow,
): Promise<AdminTenantSnapshot> {
  return supabase.rpc<AdminTenantSnapshot>({
    schema: "control",
    functionName: "get_tenant_admin_snapshot",
    args: {
      p_schema_name: tenant.schema_name,
      p_timezone: tenant.timezone ?? "America/Bogota",
    },
  }).catch((error) => {
    if (isMissingTableError(error)) return {};
    throw error;
  });
}

export async function getTenantById(env: ApiBindings, tenantId: string): Promise<TenantRow | undefined> {
  const [tenant] = await createSupabaseRestClient(env).select<TenantRow>({
    schema: "control",
    table: "tenants",
    query: {
      select: "id,name,slug,schema_name,status,timezone,currency,automation_enabled,created_at,updated_at",
      id: `eq.${tenantId}`,
      limit: 1,
    },
  });

  return tenant;
}

export async function updatePrimaryLocation(
  env: ApiBindings,
  schema: string,
  patch: {
    name?: string;
    address?: string;
    phone?: string;
    deliveryFeeFixed?: number;
    pickupEnabled?: boolean;
    deliveryEnabled?: boolean;
    automationEnabled?: boolean;
    transferPaymentInstructions?: string;
  },
) {
  if (Object.values(patch).every((value) => value === undefined)) return;

  await createSupabaseRestClient(env).rpc({
    schema: "control",
    functionName: "update_tenant_primary_location",
    args: {
      p_schema_name: schema,
      p_name: patch.name,
      p_address: patch.address,
      p_phone: patch.phone,
      p_delivery_fee_fixed: patch.deliveryFeeFixed,
      p_pickup_enabled: patch.pickupEnabled,
      p_delivery_enabled: patch.deliveryEnabled,
      p_automation_enabled: patch.automationEnabled,
      p_transfer_payment_instructions: patch.transferPaymentInstructions,
    },
  });
}

export async function createOrLinkRestaurantMember(
  env: ApiBindings,
  tenant: TenantRow,
  input: {
    email: string;
    name: string;
    password: string;
    role: TenantUserRow["role"];
    resetPasswordIfUserExists?: boolean;
  },
) {
  const existing = await findAuthAdminUserByEmail(env, input.email);
  const user = existing ?? await createAuthAdminUser(env, {
    email: input.email,
    password: input.password,
    name: input.name,
  });

  if (existing && input.resetPasswordIfUserExists) {
    await updateAuthAdminUser(env, existing.id, { password: input.password });
  }

  await createSupabaseRestClient(env).upsert({
    schema: "control",
    table: "tenant_users",
    onConflict: "tenant_id,user_id",
    rows: {
      tenant_id: tenant.id,
      user_id: user.id,
      role: input.role,
      status: "active",
    },
  });

  return {
    member: mapAdminMember({
      tenant_id: tenant.id,
      user_id: user.id,
      role: input.role,
      status: "active",
    }, user),
  };
}

export async function createAuthAdminUser(
  env: ApiBindings,
  input: {
    email: string;
    password: string;
    name: string;
  },
): Promise<AdminAuthUser> {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users`, {
    method: "POST",
    headers: buildAuthAdminHeaders(env),
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        name: input.name,
        source: "admin_console",
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new SupabaseRestError("supabase_auth_admin_create_user_failed", response.status, body);
  }

  return response.json() as Promise<AdminAuthUser>;
}

export async function updateAuthAdminUser(env: ApiBindings, userId: string, patch: Record<string, unknown>): Promise<AdminAuthUser> {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: buildAuthAdminHeaders(env),
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new SupabaseRestError("supabase_auth_admin_update_user_failed", response.status, body);
  }

  return response.json() as Promise<AdminAuthUser>;
}

export async function getAuthAdminUser(env: ApiBindings, userId: string): Promise<AdminAuthUser> {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users/${userId}`, {
    headers: buildAuthAdminHeaders(env),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new SupabaseRestError("supabase_auth_admin_get_user_failed", response.status, body);
  }

  return response.json() as Promise<AdminAuthUser>;
}

export async function findAuthAdminUserByEmail(env: ApiBindings, email: string): Promise<AdminAuthUser | undefined> {
  const targetEmail = email.trim().toLowerCase();

  for (let page = 1; page <= 10; page += 1) {
    const url = new URL(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "100");
    const response = await fetch(url.toString(), {
      headers: buildAuthAdminHeaders(env),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SupabaseRestError("supabase_auth_admin_list_users_failed", response.status, body);
    }

    const payload = await response.json() as { users?: AdminAuthUser[] };
    const users = payload.users ?? [];
    const found = users.find((user) => user.email?.toLowerCase() === targetEmail);
    if (found) return found;
    if (users.length < 100) return undefined;
  }

  return undefined;
}

export function buildAuthAdminHeaders(env: ApiBindings): HeadersInit {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

