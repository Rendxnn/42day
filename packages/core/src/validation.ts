import type { DraftOrder, OrderLineItemOptionsSnapshot } from "@42day/types";

export type DraftValidationResult = {
  ok: boolean;
  errors: string[];
};

export function validateDraftForConfirmation(draft: DraftOrder): DraftValidationResult {
  const errors: string[] = [];

  if (draft.items.length === 0) {
    errors.push("draft_order.items_required");
  }

  if (draft.items.some((item) => itemNeedsConfiguration(item.options))) {
    errors.push("draft_order.items_require_configuration");
  }

  if (!draft.fulfillmentType) {
    errors.push("draft_order.fulfillment_type_required");
  }

  if (draft.fulfillmentType === "delivery" && !draft.deliveryAddress) {
    errors.push("draft_order.delivery_address_required");
  }

  if (!draft.billing?.type) {
    errors.push("draft_order.billing_required");
  } else if (draft.billing.type === "normal") {
    if (!draft.billing.fullName?.trim()) {
      errors.push("draft_order.billing_full_name_required");
    }

    if (draft.fulfillmentType === "delivery" && !draft.billing.billingAddress?.trim()) {
      errors.push("draft_order.billing_address_required");
    }
  } else if (draft.billing.type === "electronic") {
    if (!draft.billing.legalName?.trim()) {
      errors.push("draft_order.billing_legal_name_required");
    }

    if (!draft.billing.taxId?.trim()) {
      errors.push("draft_order.billing_tax_id_required");
    }

    if (!draft.billing.email?.trim()) {
      errors.push("draft_order.billing_email_required");
    }
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

function itemNeedsConfiguration(options: OrderLineItemOptionsSnapshot | undefined): boolean {
  if (!options?.validation) {
    return false;
  }

  return options.validation.status !== "resolved";
}
