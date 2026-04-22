import type { DraftOrder, OrderStatus } from "@42day/types";

export type FinalOrderDraft = {
  draftOrderId: string;
  status: OrderStatus;
  subtotal: number;
  deliveryFee: number;
  discountTotal: number;
  total: number;
};

export function buildFinalOrderFromDraft(draft: DraftOrder): FinalOrderDraft {
  return {
    draftOrderId: draft.id,
    status: draft.paymentMethod === "transfer" ? "payment_pending_review" : "new",
    subtotal: draft.subtotal,
    deliveryFee: draft.deliveryFee,
    discountTotal: draft.discountTotal,
    total: draft.total,
  };
}
