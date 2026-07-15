import type { FulfillmentType, OrderStatus } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { createSupabaseRestClient } from "../../lib/supabase-rest";

export type CustomerOrderStatus = {
  id: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  updatedAt: string;
};

export async function getLatestCustomerOrderStatus(input: {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
  currentDraftOrderId?: string;
}): Promise<CustomerOrderStatus | undefined> {
  const client = createSupabaseRestClient(input.env);
  const draftOrderIds = new Set<string>();
  if (input.currentDraftOrderId) {
    draftOrderIds.add(input.currentDraftOrderId);
  }

  const drafts = await client.select<{ id: string }>({
    schema: input.schemaName,
    table: "draft_orders",
    query: {
      select: "id",
      conversation_id: `eq.${input.conversationId}`,
      order: "updated_at.desc",
      limit: 10,
    },
  }).catch(() => []);
  for (const draft of drafts) {
    draftOrderIds.add(draft.id);
  }

  if (draftOrderIds.size === 0) {
    return undefined;
  }

  const [order] = await client.select<{
    id: string;
    status: OrderStatus;
    fulfillment_type: FulfillmentType;
    updated_at: string;
  }>({
    schema: input.schemaName,
    table: "orders",
    query: {
      select: "id,status,fulfillment_type,updated_at",
      draft_order_id: `in.(${Array.from(draftOrderIds).join(",")})`,
      order: "updated_at.desc",
      limit: 1,
    },
  });

  if (!order) {
    return undefined;
  }

  return {
    id: order.id,
    status: order.status,
    fulfillmentType: order.fulfillment_type,
    updatedAt: order.updated_at,
  };
}
