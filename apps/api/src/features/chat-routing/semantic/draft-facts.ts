import type { DetectedSignals } from "../../../modules/message-router/signal-detector";
import type { SemanticParserResult } from "../../../modules/semantic-parser/semantic-parser";
import type { DraftFacts } from "../checkout";

export function buildSemanticDraftFacts(parsed: SemanticParserResult, signals: DetectedSignals): DraftFacts {
  const facts = parsed.draftFacts;
  const billing = facts?.billing;
  const billingIsConfident = (billing?.confidence ?? 0) >= 0.75;
  const normalizedBilling = !billingIsConfident || !billing
    ? undefined
    : billing.type === "electronic"
      && billing.legalName?.trim() && billing.taxId?.trim() && billing.email?.includes("@")
      ? {
          type: "electronic" as const,
          legalName: billing.legalName.trim(),
          taxId: billing.taxId.trim(),
          email: billing.email.trim(),
        }
      : (billing.type === "normal" || billing.fullName?.trim()) && billing.fullName?.trim()
        ? {
            type: "normal" as const,
            fullName: billing.fullName.trim(),
            billingAddress: billing.billingAddress?.trim() || undefined,
          }
        : undefined;

  return {
    fulfillmentType: signals.fulfillmentType,
    paymentMethod: signals.paymentMethod,
    deliveryAddressText: (facts?.deliveryAddressConfidence ?? 0) >= 0.75
      ? facts?.deliveryAddressText?.trim() || parsed.addressText?.trim() || undefined
      : undefined,
    deliveryAddressDetails: (facts?.deliveryAddressConfidence ?? 0) >= 0.75
      ? facts?.deliveryAddressDetails?.trim() || parsed.addressDetails?.trim() || undefined
      : undefined,
    billing: normalizedBilling,
  };
}

export function hasDraftFacts(facts: DraftFacts): boolean {
  return Boolean(facts.fulfillmentType || facts.paymentMethod || facts.deliveryAddressText || facts.deliveryAddressDetails || facts.billing);
}
