import type { OutOfStockReplacementOption } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { createSupabaseRestClient } from "../../lib/supabase-rest";
import type { DraftOrderItemRow, DraftOrderRow, OrderItemRow } from "./repository";

export function buildReplacementReviewMetadata(input: {
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

export async function replaceDraftOrderItemWithSelection(input: {
  env: ApiBindings;
  schemaName: string;
  draftOrder: DraftOrderRow;
  unavailableOrderItem: OrderItemRow;
  replacementMenuItem: Pick<OrderItemRow, "product_id" | "combo_id"> & {
    id: string;
    display_name?: string | null;
    price_override?: number | null;
  };
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
