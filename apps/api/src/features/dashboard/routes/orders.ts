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
import { buildAcceptedOrderNotification } from "../order-customer-notifications";
import type {
  AlertRow,
  AppEventRow,
  ConversationRow,
  CustomerRow,
  DashboardVariables,
  DraftOrderItemRow,
  DraftOrderRow,
  LocationRow,
  OrderItemRow,
  OrderRow,
  MenuRow,
  MenuItemRow,
} from "../types";
import {
  buildOutOfStockMessage,
  buildRetryNotificationMessage,
  isOpenConversation,
  isOpenDraftOrder,
  loadOrderNotificationContext,
  mapDashboardNotification,
  mapOpenConversationSummary,
  mapOrderSummaryAsOpenSummary,
  mapOpenOrderSummary,
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
const DRAFT_ORDER_SELECT =
  "id,conversation_id,customer_id,location_id,status,fulfillment_type,service_timing,scheduled_for,delivery_address,delivery_address_id,payment_method,subtotal,delivery_fee,discount_total,total,validation_errors,expires_at,created_at,updated_at";
const DRAFT_ORDER_ITEM_SELECT =
  "id,draft_order_id,menu_item_id,product_id,combo_id,name_snapshot,quantity,unit_price,options_snapshot,notes,line_total";
const CONVERSATION_SELECT =
  "id,customer_id,state,current_draft_order_id,last_inbound_at,expires_at,created_at,updated_at";

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
  let draftOrders: DraftOrderRow[] = [];
  let draftOrderItems: DraftOrderItemRow[] = [];
  let conversations: ConversationRow[] = [];

  try {
    [orders, customers, alerts, draftOrders, conversations] = await Promise.all([
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
      supabase.select<DraftOrderRow>({
        schema: tenant.schema_name,
        table: "draft_orders",
        query: {
          select: DRAFT_ORDER_SELECT,
          order: "updated_at.desc",
          limit,
        },
      }),
      supabase.select<ConversationRow>({
        schema: tenant.schema_name,
        table: "conversations",
        query: {
          select: CONVERSATION_SELECT,
          order: "updated_at.desc",
          limit: 500,
        },
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

  const activeConversationDraftIds = new Set(
    conversations
      .filter(isOpenConversation)
      .map((conversation) => conversation.current_draft_order_id)
      .filter((draftOrderId): draftOrderId is string => Boolean(draftOrderId)),
  );
  const activeDraftIds = new Set([
    ...draftOrders
      .filter((draftOrder) => draftOrder.conversation_id && conversations.some((conversation) => conversation.id === draftOrder.conversation_id && isOpenConversation(conversation)))
      .map((draftOrder) => draftOrder.id),
    ...activeConversationDraftIds,
  ]);
  if (activeDraftIds.size > 0) {
    try {
      const draftOrderIds = Array.from(activeDraftIds);
      const batches = Array.from({ length: Math.ceil(draftOrderIds.length / 50) }, (_, index) => draftOrderIds.slice(index * 50, index * 50 + 50));
      draftOrderItems = (await Promise.all(batches.map((batch) => supabase.select<DraftOrderItemRow>({
        schema: tenant.schema_name,
        table: "draft_order_items",
        query: {
          select: DRAFT_ORDER_ITEM_SELECT,
          draft_order_id: `in.(${batch.join(",")})`,
        },
      })))).flat();
    } catch (error) {
      if (!isMissingTableError(error)) {
        throw error;
      }
    }
  }

  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  const conversationByDraftOrderId = new Map(
    draftOrders
      .filter((draftOrder) => draftOrder.conversation_id)
      .map((draftOrder) => [draftOrder.id, draftOrder.conversation_id ? conversationById.get(draftOrder.conversation_id) : undefined]),
  );
  const draftOrderById = new Map(draftOrders.map((draftOrder) => [draftOrder.id, draftOrder]));
  const orderByDraftOrderId = new Map(orders.filter((order) => order.draft_order_id).map((order) => [order.draft_order_id as string, order]));
  const itemsByOrderId = new Map<string, OrderItemRow[]>();
  for (const item of orderItems) {
    const current = itemsByOrderId.get(item.order_id) ?? [];
    current.push(item);
    itemsByOrderId.set(item.order_id, current);
  }
  const itemsByDraftOrderId = new Map<string, DraftOrderItemRow[]>();
  for (const item of draftOrderItems) {
    const current = itemsByDraftOrderId.get(item.draft_order_id) ?? [];
    current.push(item);
    itemsByDraftOrderId.set(item.draft_order_id, current);
  }
  const summaries = orders.map((order) => ({
    ...mapOrderSummary(order, customerById.get(order.customer_id)),
    items: (itemsByOrderId.get(order.id) ?? []).map(mapOrderLineItem),
  }));
  const openOrdersByKey = new Map<string, ReturnType<typeof mapOpenConversationSummary>>();
  for (const conversation of conversations.filter(isOpenConversation)) {
      const draftOrder = conversation.current_draft_order_id
        ? draftOrderById.get(conversation.current_draft_order_id)
        : draftOrders.find((candidate) => candidate.conversation_id === conversation.id);

      if (draftOrder && isOpenDraftOrder(draftOrder, conversation)) {
        const summary = mapOpenOrderSummary(
          draftOrder,
          customerById.get(draftOrder.customer_id),
          conversation,
          itemsByDraftOrderId.get(draftOrder.id) ?? [],
          orderByDraftOrderId.get(draftOrder.id),
        );
        openOrdersByKey.set(summary.linkedOrderId ?? summary.draftOrderId ?? summary.conversationId ?? summary.id, summary);
        continue;
      }

      const summary = mapOpenConversationSummary(conversation, customerById.get(conversation.customer_id));
      openOrdersByKey.set(summary.linkedOrderId ?? summary.draftOrderId ?? summary.conversationId ?? summary.id, summary);
  }

  for (const order of summaries.filter((summary) => summary.status === "pending_restaurant_confirmation" || summary.status === "new")) {
    const key = order.id;
    if (openOrdersByKey.has(key)) {
      continue;
    }

    const linkedConversation = order.draftOrderId ? conversationByDraftOrderId.get(order.draftOrderId) : undefined;
    openOrdersByKey.set(key, mapOrderSummaryAsOpenSummary(order, linkedConversation));
  }

  for (const draftOrder of draftOrders.filter((candidate) => ["draft", "needs_clarification", "ready_for_confirmation"].includes(candidate.status))) {
    const linkedConversation = draftOrder.conversation_id ? conversationById.get(draftOrder.conversation_id) : undefined;
    if (linkedConversation && !isOpenConversation(linkedConversation)) {
      continue;
    }

    const linkedOrder = orderByDraftOrderId.get(draftOrder.id);
    if (linkedOrder && ["pending_restaurant_confirmation", "new"].includes(linkedOrder.status)) {
      continue;
    }

    const summary = mapOpenOrderSummary(
      draftOrder,
      customerById.get(draftOrder.customer_id),
      linkedConversation,
      itemsByDraftOrderId.get(draftOrder.id) ?? [],
      linkedOrder,
    );
    openOrdersByKey.set(summary.linkedOrderId ?? summary.draftOrderId ?? summary.conversationId ?? summary.id, summary);
  }

  const openOrders = Array.from(openOrdersByKey.values())
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  const filteredOrders = summaries.filter((order) => matchesOrdersBucket(order, bucket));
  const openAlerts = alerts.filter((alert) => alert.status === "open");
  const payload: OrdersDashboardPayload = {
    bucket,
    counts: {
      open: openOrders.length,
      pendingConfirmation: summaries.filter((order) => matchesOrdersBucket(order, "pending_confirmation")).length,
      active: summaries.filter((order) => matchesOrdersBucket(order, "active")).length,
      history: summaries.filter((order) => matchesOrdersBucket(order, "history")).length,
      transferPendingReview: summaries.filter((order) => order.status === "payment_pending_review").length,
      openAlerts: openAlerts.length,
    },
    openOrders,
    orders: filteredOrders,
  };

  return c.json(payload);
});

ordersDashboardRoutes.get("/:tenantSlug/notifications", async (c) => {
  const tenant = c.get("tenant");
  const supabase = createSupabaseRestClient(c.env);
  const limit = parsePositiveInt(c.req.query("limit"), 40);
  let events: AppEventRow[] = [];

  try {
    events = await supabase.select<AppEventRow>({
      schema: tenant.schema_name,
      table: "app_events",
      query: {
        select: "id,conversation_id,draft_order_id,order_id,event_name,severity,source,metadata,created_at",
        event_name: "in.(order.pending_restaurant_confirmation_created,whatsapp.customer_notification_failed,whatsapp.customer_notification_sent,order.payment_pending_review,order.payment_confirmed,order.customer_replacement_selected,order.customer_cancelled_after_out_of_stock,order.out_of_stock_returned_to_customer,order.cancelled_by_restaurant)",
        order: "created_at.desc",
        limit,
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return c.json([]);
    }

    throw error;
  }

  if (events.length === 0) {
    return c.json([]);
  }

  const orderIds = Array.from(new Set(events.map((event) => event.order_id).filter((id): id is string => Boolean(id))));
  const draftOrderIds = Array.from(new Set(events.map((event) => event.draft_order_id).filter((id): id is string => Boolean(id))));
  const [orders, draftOrders] = await Promise.all([
    orderIds.length > 0
      ? supabase.select<OrderRow>({
          schema: tenant.schema_name,
          table: "orders",
          query: {
            select: ORDER_SELECT,
            id: `in.(${orderIds.join(",")})`,
            limit: orderIds.length,
          },
        })
      : Promise.resolve([] as OrderRow[]),
    draftOrderIds.length > 0
      ? supabase.select<DraftOrderRow>({
          schema: tenant.schema_name,
          table: "draft_orders",
          query: {
            select: DRAFT_ORDER_SELECT,
            id: `in.(${draftOrderIds.join(",")})`,
            limit: draftOrderIds.length,
          },
        })
      : Promise.resolve([] as DraftOrderRow[]),
  ]);

  const customerIds = Array.from(new Set([
    ...orders.map((order) => order.customer_id),
    ...draftOrders.map((draftOrder) => draftOrder.customer_id),
  ]));
  const customers = customerIds.length > 0
    ? await supabase.select<CustomerRow>({
        schema: tenant.schema_name,
        table: "customers",
        query: {
          select: CUSTOMER_SELECT,
          id: `in.(${customerIds.join(",")})`,
          limit: customerIds.length,
        },
      })
    : [];

  const orderById = new Map(orders.map((order) => [order.id, order]));
  const draftOrderById = new Map(draftOrders.map((draftOrder) => [draftOrder.id, draftOrder]));
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));

  return c.json(events.map((event) => {
    const order = event.order_id ? orderById.get(event.order_id) : undefined;
    const draftOrder = event.draft_order_id ? draftOrderById.get(event.draft_order_id) : undefined;
    const customer = order
      ? customerById.get(order.customer_id)
      : draftOrder
        ? customerById.get(draftOrder.customer_id)
        : undefined;

    return mapDashboardNotification(event, { customer, draftOrder, order });
  }));
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

  const acceptedNotification = await buildAcceptedOrderNotification({
    env: c.env,
    tenant,
    order: context.order,
  });
  const now = new Date().toISOString();
  const status = "accepted" as const;
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
      state: acceptedNotification.conversationState,
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

  const finalOrder = await sendOrderCustomerNotification({
    env: c.env,
    schemaName: tenant.schema_name,
    context: {
      ...context,
      order: updated ?? context.order,
    },
    notification: acceptedNotification.notification,
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
    notification: {
      kind: "text",
      text: notificationText,
    },
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

  const notification = body.type === "accepted"
    ? await buildAcceptedOrderNotification({
        env: c.env,
        tenant,
        order: context.order,
      }).then((result) => result.notification)
    : (() => {
        const text = buildRetryNotificationMessage(body.type, context.order, context.location);
        return text ? { kind: "text" as const, text } : null;
      })();

  if (!notification) {
    return c.json({ error: "customer_notification_retry_not_available" }, 409);
  }

  const finalOrder = await sendOrderCustomerNotification({
    env: c.env,
    schemaName: tenant.schema_name,
    context,
    notification,
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

  if (body.status === "cancelled" && order.draft_order_id) {
    const [draftOrder] = await createSupabaseRestClient(c.env).select<DraftOrderRow>({
      schema: tenant.schema_name,
      table: "draft_orders",
      query: {
        select: DRAFT_ORDER_SELECT,
        id: `eq.${order.draft_order_id}`,
        limit: 1,
      },
    });

    await createSupabaseRestClient(c.env).update({
      schema: tenant.schema_name,
      table: "draft_orders",
      values: {
        status: "cancelled",
        updated_at: now,
      },
      query: { id: `eq.${order.draft_order_id}` },
    }).catch(() => undefined);

    if (draftOrder?.conversation_id) {
      await createSupabaseRestClient(c.env).update({
        schema: tenant.schema_name,
        table: "conversations",
        values: {
          state: "awaiting_mode_selection",
          current_draft_order_id: null,
          context: {},
          manual_reason: null,
          clarification_attempts: 0,
          updated_at: now,
        },
        query: { id: `eq.${draftOrder.conversation_id}` },
      }).catch(() => undefined);

      await createSupabaseRestClient(c.env).insert({
        schema: tenant.schema_name,
        table: "app_events",
        rows: {
          conversation_id: draftOrder.conversation_id,
          draft_order_id: order.draft_order_id,
          order_id: order.id,
          event_name: "order.cancelled_by_restaurant",
          severity: "info",
          source: "dashboard_api",
          metadata: {
            agentReset: true,
          },
        },
      }).catch(() => undefined);
    }
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
