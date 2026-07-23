import type { Hono } from "hono";
import type { OpenOrderSummary, OrdersDashboardPayload } from "@42day/types";
import { createSupabaseRestClient } from "../../../../lib/supabase-rest";
import type { ApiBindings } from "../../../../lib/bindings";
import { isMissingTableError } from "../../../../shared/errors/supabase";
import { selectAlerts } from "../../support/alerts";
import {
  isOpenConversation,
  isOpenDraftOrder,
  mapOpenConversationSummary,
  mapOpenOrderSummary,
  mapConversationAutomation,
  mapOrderLineItem,
  mapOrderSummary,
  mapOrderSummaryAsOpenSummary,
  matchesOrdersBucket,
  parseOrderStatusFilter,
  parseOrdersBucket,
  parsePositiveInt,
} from "../../support/orders";
import type { AlertRow, ConversationRow, CustomerRow, DashboardVariables, DraftOrderItemRow, DraftOrderRow, OrderItemRow, OrderRow } from "../../types";
import { CONVERSATION_SELECT, CUSTOMER_SELECT, DRAFT_ORDER_ITEM_SELECT, DRAFT_ORDER_SELECT, ORDER_ITEM_SELECT, ORDER_SELECT } from "./contracts";

export function registerOrdersListRoute(routes: Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>) {
  routes.get("/:tenantSlug/orders", async (c) => {
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

    try {
      [draftOrders, conversations] = await Promise.all([
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
        .filter((draftOrder) =>
          draftOrder.conversation_id && conversations.some((conversation) => conversation.id === draftOrder.conversation_id && isOpenConversation(conversation)))
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

    const summaries = orders.map((order) => {
      const conversation = order.draft_order_id ? conversationByDraftOrderId.get(order.draft_order_id) : undefined;
      return {
        ...mapOrderSummary(order, customerById.get(order.customer_id)),
        conversationId: conversation?.id,
        conversationAutomation: conversation ? mapConversationAutomation(conversation) : undefined,
        items: (itemsByOrderId.get(order.id) ?? []).map(mapOrderLineItem),
      };
    });

    const openOrdersByKey = new Map<string, OpenOrderSummary>();
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
}
