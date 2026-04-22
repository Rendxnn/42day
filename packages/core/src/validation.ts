import type { DraftOrder } from "@42day/types";

export type DraftValidationResult = {
  ok: boolean;
  errors: string[];
};

export function validateDraftForConfirmation(draft: DraftOrder): DraftValidationResult {
  const errors: string[] = [];

  if (draft.items.length === 0) {
    errors.push("draft_order.items_required");
  }

  if (!draft.fulfillmentType) {
    errors.push("draft_order.fulfillment_type_required");
  }

  if (draft.fulfillmentType === "delivery" && !draft.deliveryAddress) {
    errors.push("draft_order.delivery_address_required");
  }

  if (!draft.paymentMethod) {
    errors.push("draft_order.payment_method_required");
  }

  if (draft.total < 0) {
    errors.push("draft_order.total_invalid");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
