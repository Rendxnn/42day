import type { DraftOrder, OrderBillingDetails, TodayMenuPayload } from "@42day/types";
import { saveCustomerBillingProfile } from "../../../modules/customer-billing-service/customer-billing-service";
import {
  updateDraftOrderBilling,
  updateDraftOrderFulfillment,
  updateDraftOrderPaymentMethod,
} from "../../draft-orders/service";
import { applyBillingDefaults } from "./billing-helpers";
import type { RouteInboundMessageInput } from "../shared/types";
import { logRoutingDiagnostic } from "../shared/tracing";

export type DraftFacts = {
  fulfillmentType?: "delivery" | "pickup" | null;
  paymentMethod?: "cash" | "transfer" | null;
  deliveryAddressText?: string | null;
  deliveryAddressDetails?: string | null;
  billing?: OrderBillingDetails | null;
};

export async function applyDraftFacts(input: RouteInboundMessageInput, payload: {
  menu: TodayMenuPayload;
  draft: DraftOrder;
  facts: DraftFacts;
}): Promise<DraftOrder> {
  let draft = payload.draft;
  const deliveryFeeFixed = payload.menu.location?.deliveryFeeFixed;

  logRoutingDiagnostic(input, "draft_facts.apply_started", {
    draftOrderId: draft.id,
    requestedFacts: summarizeFacts(payload.facts),
    before: summarizeDraft(draft),
  });

  if (payload.facts.fulfillmentType) {
    draft = await updateDraftOrderFulfillment({
      env: input.env,
      schemaName: input.tenant.schemaName,
      draftOrderId: draft.id,
      fulfillmentType: payload.facts.fulfillmentType,
      deliveryFeeFixed,
    });
    logRoutingDiagnostic(input, "draft_facts.fulfillment_applied", { draftOrderId: draft.id, after: summarizeDraft(draft) });
  }

  if (payload.facts.billing) {
    const billing = applyBillingDefaults(payload.facts.billing, draft);
    const profile = await saveCustomerBillingProfile({
      env: input.env,
      schemaName: input.tenant.schemaName,
      customerId: input.conversation.customerId,
      billing,
    });
    draft = await updateDraftOrderBilling({
      env: input.env,
      schemaName: input.tenant.schemaName,
      draftOrderId: draft.id,
      billing: { ...billing, profileId: profile.id },
      deliveryFeeFixed,
    });
    logRoutingDiagnostic(input, "draft_facts.billing_applied", { draftOrderId: draft.id, after: summarizeDraft(draft) });
  }

  if (payload.facts.paymentMethod) {
    draft = await updateDraftOrderPaymentMethod({
      env: input.env,
      schemaName: input.tenant.schemaName,
      draftOrderId: draft.id,
      paymentMethod: payload.facts.paymentMethod,
      deliveryFeeFixed,
    });
    logRoutingDiagnostic(input, "draft_facts.payment_applied", { draftOrderId: draft.id, after: summarizeDraft(draft) });
  }

  logRoutingDiagnostic(input, "draft_facts.apply_completed", { draftOrderId: draft.id, after: summarizeDraft(draft) });
  return draft;
}

function summarizeFacts(facts: DraftFacts): Record<string, unknown> {
  return {
    fulfillmentType: facts.fulfillmentType ?? null,
    paymentMethod: facts.paymentMethod ?? null,
    hasDeliveryAddress: Boolean(facts.deliveryAddressText?.trim()),
    hasDeliveryAddressDetails: Boolean(facts.deliveryAddressDetails?.trim()),
    billing: facts.billing
      ? { type: facts.billing.type, hasName: Boolean(facts.billing.fullName || facts.billing.legalName), hasAddress: Boolean(facts.billing.billingAddress), hasTaxId: Boolean(facts.billing.taxId), hasEmail: Boolean(facts.billing.email) }
      : null,
  };
}

function summarizeDraft(draft: DraftOrder): Record<string, unknown> {
  return {
    status: draft.status,
    items: draft.items.map((item) => ({ name: item.name, quantity: item.quantity, lineTotal: item.lineTotal })),
    fulfillmentType: draft.fulfillmentType ?? null,
    paymentMethod: draft.paymentMethod ?? null,
    hasDeliveryAddress: Boolean(draft.deliveryAddress || draft.deliveryAddressId),
    coverage: draft.coverageValidationMethod ?? null,
    billing: draft.billing ? { type: draft.billing.type, hasName: Boolean(draft.billing.fullName || draft.billing.legalName) } : null,
    total: draft.total,
  };
}
