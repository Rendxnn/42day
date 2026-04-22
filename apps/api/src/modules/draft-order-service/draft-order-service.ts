import { calculateDraftTotals, validateDraftForConfirmation } from "@42day/core";
import type { DraftOrder, FulfillmentType, OrderLineItem, PaymentMethod } from "@42day/types";

export function createEmptyDraftOrder(input: {
  id: string;
  items?: OrderLineItem[];
  fulfillmentType?: FulfillmentType;
  deliveryAddress?: string;
  paymentMethod?: PaymentMethod;
  deliveryFeeFixed?: number;
}): DraftOrder {
  const totals = calculateDraftTotals({
    items: input.items ?? [],
    fulfillmentType: input.fulfillmentType,
    deliveryFeeFixed: input.deliveryFeeFixed ?? 0,
  });

  return {
    id: input.id,
    status: "draft",
    fulfillmentType: input.fulfillmentType,
    deliveryAddress: input.deliveryAddress,
    paymentMethod: input.paymentMethod,
    items: input.items ?? [],
    ...totals,
  };
}

export function markDraftReadyIfValid(draft: DraftOrder): DraftOrder {
  const validation = validateDraftForConfirmation(draft);

  return {
    ...draft,
    status: validation.ok ? "ready_for_confirmation" : "needs_clarification",
    validationErrors: validation.errors,
  };
}
