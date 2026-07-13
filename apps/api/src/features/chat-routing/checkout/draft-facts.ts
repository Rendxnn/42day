import type { DraftOrder, OrderBillingDetails, TodayMenuPayload } from "@42day/types";
import { saveCustomerAddressFromText } from "../../../modules/customer-address-service/customer-address-service";
import { saveCustomerBillingProfile } from "../../../modules/customer-billing-service/customer-billing-service";
import { getDeliveryCoverageSettings } from "../../delivery-coverage/service";
import {
  updateDraftOrderBilling,
  updateDraftOrderCoverage,
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

  if (payload.facts.deliveryAddressText?.trim() && draft.fulfillmentType === "delivery") {
    const settings = await getDeliveryCoverageSettings({
      env: input.env,
      schemaName: input.tenant.schemaName,
      locationId: draft.locationId ?? payload.menu.location?.id,
    });
    if (settings?.allowWrittenAddressReference !== false) {
      const address = await saveCustomerAddressFromText({
        env: input.env,
        schemaName: input.tenant.schemaName,
        customerId: input.conversation.customerId,
        addressText: payload.facts.deliveryAddressText,
      });
      draft = await updateDraftOrderCoverage({
        env: input.env,
        schemaName: input.tenant.schemaName,
        draftOrderId: draft.id,
        customerAddressText: address.addressText,
        deliveryAddressId: address.id,
        validationMethod: "written_address_reference",
        confidence: "low",
        deliveryFeeFixed,
      });
      logRoutingDiagnostic(input, "draft_facts.delivery_address_reference_applied", { draftOrderId: draft.id, after: summarizeDraft(draft) });
    } else {
      logRoutingDiagnostic(input, "draft_facts.delivery_address_skipped", {
        draftOrderId: draft.id,
        reason: "written_address_reference_disabled",
      });
    }
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
