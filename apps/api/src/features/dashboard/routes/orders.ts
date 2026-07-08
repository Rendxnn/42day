import { Hono } from "hono";
import type {
  AcceptOrderRequest,
  OrderDetail,
  OrderStatus,
  OrdersBucket,
  OrdersDashboardPayload,
  RejectOutOfStockOrderRequest,
  RetryOrderCustomerNotificationRequest,
  TodayMenuPayload,
} from "@42day/types";
import type { ApiBindings } from "../../../lib/bindings";
import { createSupabaseRestClient } from "../../../lib/supabase-rest";
import { isMissingTableError } from "../../../shared/errors/supabase";
import { updateConversationState } from "../../../modules/conversation-service/conversation-service";
import {
  confirmLatestPaymentProofForOrder,
  downloadLatestPaymentProofForOrder,
  getLatestPaymentProofForOrder,
} from "../../payment-proofs/service";
import { getTenantUserRole } from "../auth";
import type {
  AlertRow,
  CustomerRow,
  DashboardVariables,
  LocationRow,
  OrderItemRow,
  OrderRow,
  MenuRow,
  MenuItemRow,
} from "../types";
import {
  buildAcceptedOrderMessage,
  buildOutOfStockMessage,
  buildRetryNotificationMessage,
  loadOrderNotificationContext,
  mapOrderLineItem,
  mapLocation,
  mapMenu,
  mapMenuItem,
  mapProduct,
  mapOrderSummary,
  matchesOrdersBucket,
  parseOrderStatusFilter,
  parseOrdersBucket,
  parsePositiveInt,
  resolveBusinessDate,
  resolvePendingConfirmationAlerts,
  resolveReplacementOptions,
  selectAlerts,
  selectProductOptions,
  selectProducts,
  sendOrderCustomerNotification,
} from "../router";

const ORDER_SELECT =
  "id,draft_order_id,customer_id,location_id,status,fulfillment_type,service_timing,scheduled_for,delivery_address,delivery_address_id,customer_address_text,customer_latitude,customer_longitude,delivery_distance_km,is_inside_delivery_coverage,coverage_validation_method,coverage_confidence,coverage_checked_at,payment_method,payment_proof_file_id,subtotal,delivery_fee,discount_total,total,restaurant_reviewed_at,restaurant_reviewed_by,restaurant_confirmed_at,restaurant_confirmed_by,restaurant_review_note,restaurant_review_metadata,customer_notified_at,customer_notification_status,customer_notification_error,payment_confirmed_at,created_at,updated_at";
const CUSTOMER_SELECT = "id,phone,name";
const ORDER_ITEM_SELECT =
  "id,order_id,menu_item_id,product_id,combo_id,category_snapshot,name_snapshot,quantity,unit_price,options_snapshot,notes,line_total";

export const ordersDashboardRoutes = new Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>();

ordersDashboardRoutes.get("/:tenantSlug/menu/today", async (c) => {
  const tenant = c.get("tenant");
  const supabase = createSupabaseRestClient(c.env);
  const date = resolveBusinessDate(c.req.query("date"), tenant.timezone);
  const [location] = await supabase.select<LocationRow>({
    schema: tenant.schema_name,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  const [menu] = location
    ? await supabase.select<MenuRow>({
        schema: tenant.schema_name,
        table: "menus",
        query: {
          select: "id,location_id,date,name,status,published_at",
          location_id: `eq.${location.id}`,
          date: `eq.${date}`,
          limit: 1,
        },
      })
    : [];

  const products = await selectProducts(supabase, tenant.schema_name);
  const productOptions = await selectProductOptions(supabase, tenant.schema_name, products.map((product) => product.id));

  const itemRows = menu
    ? await supabase.select<MenuItemRow>({
        schema: tenant.schema_name,
        table: "menu_items",
        query: {
          select: "id,menu_id,product_id,combo_id,display_name,price_override,available_quantity,is_available,sort_order",
          menu_id: `eq.${menu.id}`,
          order: "sort_order.asc",
        },
      })
    : [];

  const productById = new Map(products.map((product) => [product.id, mapProduct(product, productOptions.get(product.id))]));
  const payload: TodayMenuPayload = {
    tenantSlug: tenant.slug,
    tenantSchema: tenant.schema_name,
    location: location ? mapLocation(location) : undefined,
    menu: menu ? mapMenu(menu) : undefined,
    items: itemRows.map((item) => mapMenuItem(item, productById.get(item.product_id ?? ""))),
    products: products.map((product) => mapProduct(product, productOptions.get(product.id))),
  };

  return c.json(payload);
});

ordersDashboardRoutes.get("/:tenantSlug/orders", async (c) => {
  const tenant = c.get("tenant");
  const supabase = createSupabaseRestClient(c.env);
  const bucket = parseOrdersBucket(c.req.query("bucket"));
  const status = parseOrderStatusFilter(c.req.query("status"));
  const limit = parsePositiveInt(c.req.query("limit"), 200);
  let orders: OrderRow[] = [];
  let customers: CustomerRow[] = [];
  let alerts: AlertRow[] = [];
  let orderItems: OrderItemRow[] = [];

  try {
    [orders, customers, alerts] = await Promise.all([
      supabase.select<OrderRow>({
        schema: tenant.schema_name,
        table: "orders",
        query: {
          select: ORDER_SELECT,
          ...(status ? { status: `eq.${status}` } : {}),
          order: "created_at.desc",
          limit,
        },
      }),
      supabase.select<CustomerRow>({
        schema: tenant.schema_name,
        table: "customers",
        query: {
          select: CUSTOMER_SELECT,
          limit: 500,
        },
      }),
      selectAlerts(supabase, tenant.schema_name, {
        limit: 200,
      }),
    ]);
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  if (orders.length > 0) {
    try {
      const orderIds = orders.map((order) => order.id);
      const batches = Array.from({ length: Math.ceil(orderIds.length / 50) }, (_, index) => orderIds.slice(index * 50, index * 50 + 50));
      orderItems = (await Promise.all(batches.map((batch) => supabase.select<OrderItemRow>({
        schema: tenant.schema_name,
        table: "order_items",
        query: {
          select: ORDER_ITEM_SELECT,
          order_id: `in.(${batch.join(",")})`,
        },
      })))).flat();
    } catch (error) {
      if (!isMissingTableError(error)) {
        throw error;
      }
    }
  }

  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const itemsByOrderId = new Map<string, OrderItemRow[]>();
  for (const item of orderItems) {
    const current = itemsByOrderId.get(item.order_id) ?? [];
    current.push(item);
    itemsByOrderId.set(item.order_id, current);
  }
  const summaries = orders.map((order) => ({
    ...mapOrderSummary(order, customerById.get(order.customer_id)),
    items: (itemsByOrderId.get(order.id) ?? []).map(mapOrderLineItem),
  }));
  const filteredOrders = summaries.filter((order) => matchesOrdersBucket(order, bucket));
  const openAlerts = alerts.filter((alert) => alert.status === "open");
  const payload: OrdersDashboardPayload = {
    bucket,
    counts: {
      pendingConfirmation: summaries.filter((order) => matchesOrdersBucket(order, "pending_confirmation")).length,
      active: summaries.filter((order) => matchesOrdersBucket(order, "active")).length,
      history: summaries.filter((order) => matchesOrdersBucket(order, "history")).length,
      transferPendingReview: summaries.filter((order) => order.status === "payment_pending_review").length,
      openAlerts: openAlerts.length,
    },
    orders: filteredOrders,
  };

  return c.json(payload);
});

ordersDashboardRoutes.get("/:tenantSlug/orders/:orderId", async (c) => {
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

  const [customer, items, paymentProof] = await Promise.all([
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
  ]);

  const detail: OrderDetail = {
    ...mapOrderSummary(order, customer[0]),
    locationId: order.location_id ?? undefined,
    deliveryAddress: order.delivery_address ?? undefined,
    deliveryAddressId: order.delivery_address_id ?? undefined,
    items: items.map(mapOrderLineItem),
    paymentProof,
  };

  return c.json(detail);
});

ordersDashboardRoutes.get("/:tenantSlug/orders/:orderId/payment-proof", async (c) => {
  const tenant = c.get("tenant");
  const authUser = c.get("authUser");
  const role = await getTenantUserRole(c.env, authUser.id, tenant.id);

  if (!role) {
    return c.json({ error: "forbidden" }, 403);
  }

  const [order] = await createSupabaseRestClient(c.env).select<OrderRow>({
    schema: tenant.schema_name,
    table: "orders",
    query: {
      select: ORDER_SELECT,
      id: `eq.${c.req.param("orderId")}`,
      limit: 1,
    },
  });

  if (!order) {
    return c.json({ error: "order_not_found" }, 404);
  }

  const paymentProof = await downloadLatestPaymentProofForOrder({
    env: c.env,
    schemaName: tenant.schema_name,
    orderId: order.id,
    paymentProofId: order.payment_proof_file_id ?? undefined,
  }).catch(() => undefined);

  if (!paymentProof) {
    return c.json({ error: "payment_proof_not_found" }, 404);
  }

  return new Response(paymentProof.data, {
    headers: {
      "Content-Type": paymentProof.contentType,
      "Content-Disposition": `inline; filename="${paymentProof.filename}"`,
      "Cache-Control": "no-store",
    },
  });
});

ordersDashboardRoutes.post("/:tenantSlug/orders/:orderId/payment-proof/confirm", async (c) => {
  const tenant = c.get("tenant");
  const authUser = c.get("authUser");
  const role = await getTenantUserRole(c.env, authUser.id, tenant.id);

  if (!role) {
    return c.json({ error: "forbidden" }, 403);
  }

  try {
    await confirmLatestPaymentProofForOrder({
      env: c.env,
      schemaName: tenant.schema_name,
      orderId: c.req.param("orderId"),
      reviewedBy: authUser.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message === "payment_proof.order_not_found") {
      return c.json({ error: "order_not_found" }, 404);
    }

    if (message === "payment_proof.not_found") {
      return c.json({ error: "payment_proof_not_found" }, 404);
    }

    if (message === "payment_proof.order_not_pending_review") {
      return c.json({ error: "order_not_pending_payment_review" }, 409);
    }

    throw error;
  }

  const [updatedOrder, customer] = await Promise.all([
    createSupabaseRestClient(c.env).select<OrderRow>({
      schema: tenant.schema_name,
      table: "orders",
      query: {
        select: ORDER_SELECT,
        id: `eq.${c.req.param("orderId")}`,
        limit: 1,
      },
    }),
    createSupabaseRestClient(c.env).select<CustomerRow>({
      schema: tenant.schema_name,
      table: "customers",
      query: {
        select: CUSTOMER_SELECT,
        limit: 500,
      },
    }),
  ]);

  const order = updatedOrder[0];
  if (!order) {
    return c.json({ error: "order_not_found" }, 404);
  }

  const customerById = new Map(customer.map((entry) => [entry.id, entry]));
  return c.json(mapOrderSummary(order, customerById.get(order.customer_id)));
});

ordersDashboardRoutes.post("/:tenantSlug/orders/:orderId/accept", async (c) => {
  const tenant = c.get("tenant");
  const authUser = c.get("authUser");
  const role = await getTenantUserRole(c.env, authUser.id, tenant.id);

  if (!role) {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = (await c.req.json().catch(() => ({}))) as AcceptOrderRequest;
  const context = await loadOrderNotificationContext(c.env, tenant.schema_name, c.req.param("orderId"));

  if (!context) {
    return c.json({ error: "order_not_found" }, 404);
  }

  if (context.order.status !== "pending_restaurant_confirmation") {
    return c.json({ error: "order_not_pending_restaurant_confirmation" }, 409);
  }

  const now = new Date().toISOString();
  const status = "accepted" as const;
  const conversationState = context.order.payment_method === "transfer" ? "awaiting_transfer_proof" : "completed";
  const [updated] = await createSupabaseRestClient(c.env).updateReturning<OrderRow>({
    schema: tenant.schema_name,
    table: "orders",
    query: { id: `eq.${context.order.id}` },
    patch: {
      status,
      restaurant_reviewed_at: now,
      restaurant_reviewed_by: authUser.id,
      restaurant_confirmed_at: now,
      restaurant_confirmed_by: authUser.id,
      restaurant_review_note: body.note ?? null,
      customer_notification_status: "pending",
      customer_notification_error: null,
      updated_at: now,
    },
  });

  if (context.draftOrder?.conversation_id) {
    await updateConversationState({
      env: c.env,
      schemaName: tenant.schema_name,
      conversationId: context.draftOrder.conversation_id,
      state: conversationState,
      resetClarificationAttempts: true,
    }).catch(() => undefined);
  }

  await createSupabaseRestClient(c.env).insert({
    schema: tenant.schema_name,
    table: "app_events",
    rows: {
      conversation_id: context.draftOrder?.conversation_id ?? null,
      draft_order_id: context.order.draft_order_id ?? null,
      order_id: context.order.id,
      event_name: "order.restaurant_accepted",
      severity: "info",
      source: "dashboard_api",
      metadata: {
        reviewedBy: authUser.id,
        note: body.note ?? null,
      },
    },
  }).catch(() => undefined);

  await resolvePendingConfirmationAlerts(c.env, tenant.schema_name, context.order.id).catch(() => undefined);

  const notificationText = buildAcceptedOrderMessage(updated ?? context.order, context.location);
  const finalOrder = await sendOrderCustomerNotification({
    env: c.env,
    schemaName: tenant.schema_name,
    context: {
      ...context,
      order: updated ?? context.order,
    },
    messageText: notificationText,
    notificationType: "accepted",
  });

  return c.json(mapOrderSummary(finalOrder, context.customer));
});

ordersDashboardRoutes.post("/:tenantSlug/orders/:orderId/reject-out-of-stock", async (c) => {
  const tenant = c.get("tenant");
  const authUser = c.get("authUser");
  const role = await getTenantUserRole(c.env, authUser.id, tenant.id);

  if (!role) {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = await c.req.json<RejectOutOfStockOrderRequest>().catch(() => undefined);

  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ error: "invalid_out_of_stock_request" }, 400);
  }

  const context = await loadOrderNotificationContext(c.env, tenant.schema_name, c.req.param("orderId"));

  if (!context) {
    return c.json({ error: "order_not_found" }, 404);
  }

  if (context.order.status !== "pending_restaurant_confirmation") {
    return c.json({ error: "order_not_pending_restaurant_confirmation" }, 409);
  }

  const unavailableSelection = body.items[0];
  if (!unavailableSelection) {
    return c.json({ error: "invalid_out_of_stock_request" }, 400);
  }
  const orderItems = await createSupabaseRestClient(c.env).select<OrderItemRow>({
    schema: tenant.schema_name,
    table: "order_items",
    query: {
      select: ORDER_ITEM_SELECT,
      order_id: `eq.${context.order.id}`,
    },
  });
  const unavailableItem = orderItems.find((item) => item.id === unavailableSelection.orderItemId);

  if (!unavailableItem) {
    return c.json({ error: "order_item_not_found" }, 404);
  }

  const replacementOptions = await resolveReplacementOptions({
    env: c.env,
    schemaName: tenant.schema_name,
    tenantTimezone: tenant.timezone,
    orderItem: unavailableItem,
    requestedReplacementMenuItemIds: unavailableSelection.replacementMenuItemIds ?? [],
  });

  if (replacementOptions.length === 0) {
    return c.json({ error: "replacement_options_not_found" }, 409);
  }

  if (unavailableSelection.markMenuItemUnavailable && unavailableItem.menu_item_id) {
    await createSupabaseRestClient(c.env).update({
      schema: tenant.schema_name,
      table: "menu_items",
      values: {
        is_available: false,
      },
      query: {
        id: `eq.${unavailableItem.menu_item_id}`,
      },
    }).catch(() => undefined);

    await createSupabaseRestClient(c.env).insert({
      schema: tenant.schema_name,
      table: "app_events",
      rows: {
        conversation_id: context.draftOrder?.conversation_id ?? null,
        draft_order_id: context.order.draft_order_id ?? null,
        order_id: context.order.id,
        event_name: "menu_item.marked_unavailable_from_order",
        severity: "info",
        source: "dashboard_api",
        metadata: {
          orderItemId: unavailableItem.id,
          menuItemId: unavailableItem.menu_item_id,
          reviewedBy: authUser.id,
        },
      },
    }).catch(() => undefined);
  }

  const reviewMetadata = {
    reason: "out_of_stock",
    unavailableOrderItemIds: [unavailableItem.id],
    unavailableItems: [
      {
        orderItemId: unavailableItem.id,
        menuItemId: unavailableItem.menu_item_id ?? undefined,
        productId: unavailableItem.product_id ?? undefined,
        comboId: unavailableItem.combo_id ?? undefined,
        name: unavailableItem.name_snapshot,
        quantity: unavailableItem.quantity,
        category: unavailableItem.category_snapshot ?? undefined,
      },
    ],
    replacementMenuItems: replacementOptions,
    markMenuItemsUnavailable: Boolean(unavailableSelection.markMenuItemUnavailable),
  };

  const now = new Date().toISOString();
  const [updated] = await createSupabaseRestClient(c.env).updateReturning<OrderRow>({
    schema: tenant.schema_name,
    table: "orders",
    query: { id: `eq.${context.order.id}` },
    patch: {
      status: "needs_customer_replacement",
      restaurant_reviewed_at: now,
      restaurant_reviewed_by: authUser.id,
      restaurant_review_note: body.note ?? null,
      restaurant_review_metadata: reviewMetadata,
      customer_notification_status: "pending",
      customer_notification_error: null,
      updated_at: now,
    },
  });

  if (context.draftOrder?.conversation_id) {
    await updateConversationState({
      env: c.env,
      schemaName: tenant.schema_name,
      conversationId: context.draftOrder.conversation_id,
      state: "awaiting_replacement_selection",
      resetClarificationAttempts: true,
    }).catch(() => undefined);
  }

  await createSupabaseRestClient(c.env).insert({
    schema: tenant.schema_name,
    table: "app_events",
    rows: {
      conversation_id: context.draftOrder?.conversation_id ?? null,
      draft_order_id: context.order.draft_order_id ?? null,
      order_id: context.order.id,
      event_name: "order.out_of_stock_returned_to_customer",
      severity: "info",
      source: "dashboard_api",
      metadata: {
        reviewedBy: authUser.id,
        note: body.note ?? null,
        reviewMetadata,
      },
    },
  }).catch(() => undefined);

  await resolvePendingConfirmationAlerts(c.env, tenant.schema_name, context.order.id).catch(() => undefined);

  const notificationText = buildOutOfStockMessage(unavailableItem.name_snapshot, replacementOptions);
  const finalOrder = await sendOrderCustomerNotification({
    env: c.env,
    schemaName: tenant.schema_name,
    context: {
      ...context,
      order: updated ?? context.order,
    },
    messageText: notificationText,
    notificationType: "out_of_stock",
  });

  return c.json(mapOrderSummary(finalOrder, context.customer));
});

ordersDashboardRoutes.post("/:tenantSlug/orders/:orderId/customer-notification/retry", async (c) => {
  const tenant = c.get("tenant");
  const authUser = c.get("authUser");
  const role = await getTenantUserRole(c.env, authUser.id, tenant.id);

  if (!role) {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = await c.req.json<RetryOrderCustomerNotificationRequest>().catch(() => undefined);

  if (!body?.type) {
    return c.json({ error: "invalid_customer_notification_retry_request" }, 400);
  }

  const context = await loadOrderNotificationContext(c.env, tenant.schema_name, c.req.param("orderId"));

  if (!context) {
    return c.json({ error: "order_not_found" }, 404);
  }

  const messageText = buildRetryNotificationMessage(body.type, context.order, context.location);

  if (!messageText) {
    return c.json({ error: "customer_notification_retry_not_available" }, 409);
  }

  const finalOrder = await sendOrderCustomerNotification({
    env: c.env,
    schemaName: tenant.schema_name,
    context,
    messageText,
    notificationType: body.type,
  });

  return c.json(mapOrderSummary(finalOrder, context.customer));
});

ordersDashboardRoutes.patch("/:tenantSlug/orders/:orderId/status", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json<{
    status?: OrderStatus;
    restaurantConfirmed?: boolean;
    paymentConfirmed?: boolean;
  }>();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    updated_at: now,
  };

  if (body.status !== undefined) {
    patch.status = body.status;
  }

  if (body.restaurantConfirmed === true) {
    patch.restaurant_confirmed_at = now;
  }

  if (body.restaurantConfirmed === false) {
    patch.restaurant_confirmed_at = null;
  }

  if (body.paymentConfirmed === true) {
    patch.payment_confirmed_at = now;
  }

  if (body.paymentConfirmed === false) {
    patch.payment_confirmed_at = null;
  }

  let order: OrderRow | undefined;

  try {
    [order] = await createSupabaseRestClient(c.env).updateReturning<OrderRow>({
      schema: tenant.schema_name,
      table: "orders",
      query: { id: `eq.${c.req.param("orderId")}` },
      patch,
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

  const [customer] = await createSupabaseRestClient(c.env).select<CustomerRow>({
    schema: tenant.schema_name,
    table: "customers",
    query: {
      select: CUSTOMER_SELECT,
      id: `eq.${order.customer_id}`,
      limit: 1,
    },
  });

  return c.json(mapOrderSummary(order, customer));
});
