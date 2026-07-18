import type { Conversation, DraftOrder, MenuItem, PaymentMethod, TodayMenuPayload } from "@42day/types";
import type { DetectedSignals } from "../../../modules/message-router/signal-detector.ts";
import type { SemanticParserResult } from "../../../modules/semantic-parser/semantic-parser";
import { normalizeText } from "../../../modules/message-router/message-normalizer.ts";
import { parseSemanticFulfillmentSelection, parseSemanticPaymentMethod } from "../../../modules/message-router/signal-detector.ts";
import { loadTodayPublishedMenu } from "../../menu/service";
import type { RouteInboundMessageInput } from "./types";

export function canApplySemanticDraftChangeAtState(state: Conversation["state"]): boolean {
  return [
    "awaiting_guided_item_selection",
    "awaiting_mode_selection",
    "awaiting_more_items",
    "awaiting_fulfillment_type",
    "awaiting_address",
    "awaiting_billing_reuse_confirmation",
    "awaiting_normal_billing_info",
    "awaiting_electronic_billing_info",
    "awaiting_payment_method",
    "awaiting_confirmation",
    "awaiting_order_adjustment",
  ].includes(state);
}

export async function loadCurrentMenu(input: RouteInboundMessageInput): Promise<TodayMenuPayload> {
  return loadTodayPublishedMenu({
    env: input.env,
    schemaName: input.tenant.schemaName,
    tenantSlug: input.tenant.slug,
    timezone: input.tenant.timezone,
  });
}

export function buildGuidedContext(menu: TodayMenuPayload, selectedItem: MenuItem): Record<string, unknown> {
  return {
    flow: "guided",
    activeMenuId: menu.menu?.id,
    activeLocationId: menu.location?.id,
    lastSelectedMenuItemId: selectedItem.id,
  };
}

export function mergeSemanticSignals(signals: DetectedSignals, parsed: SemanticParserResult): DetectedSignals {
  const fulfillmentText = parsed.draftFacts?.fulfillmentConfidence !== undefined && parsed.draftFacts.fulfillmentConfidence < 0.75
    ? undefined
    : parsed.draftFacts?.fulfillmentText ?? parsed.fulfillmentText ?? undefined;
  const paymentText = parsed.draftFacts?.paymentConfidence !== undefined && parsed.draftFacts.paymentConfidence < 0.75
    ? undefined
    : parsed.draftFacts?.paymentText ?? parsed.paymentText ?? undefined;
  const confirmation = parsed.textDirectives?.confirmationConfidence !== undefined && parsed.textDirectives.confirmationConfidence < 0.75
    ? null
    : parsed.textDirectives?.confirmation ?? parseSemanticConfirmation(parsed.confirmationText);
  const wantsElectronicBilling = parsed.textDirectives?.billingDecision === "switch_to_electronic";
  const billingDataChanged = parsed.textDirectives?.billingDecision === "change";
  const doneAddingItems = parsed.textDirectives?.continueCheckoutConfidence !== undefined && parsed.textDirectives.continueCheckoutConfidence < 0.75
    ? false
    : parsed.textDirectives?.continueCheckout === true;
  const looksLikeAddress = Boolean(parsed.addressText?.trim() || (
    (parsed.draftFacts?.deliveryAddressConfidence ?? 0) >= 0.75
    && parsed.draftFacts?.deliveryAddressText?.trim()
  ));

  return {
    ...signals,
    normalizedText: signals.normalizedText || normalizeText(""),
    numericSelection: signals.numericSelection,
    isGreeting: signals.isGreeting || isSemanticGreeting(parsed),
    wantsMenu: signals.wantsMenu || parsed.intent === "menu",
    humanRequested: signals.humanRequested || parsed.intent === "support" || parsed.needsHuman === true,
    fulfillmentType: signals.fulfillmentType ?? (fulfillmentText ? parseSemanticFulfillmentSelection(fulfillmentText) : null),
    paymentMethod: signals.paymentMethod ?? (paymentText ? parseSemanticPaymentMethod(paymentText) : null),
    confirmation: signals.confirmation ?? confirmation,
    wantsElectronicBilling: signals.wantsElectronicBilling || wantsElectronicBilling,
    billingDataChanged: signals.billingDataChanged || billingDataChanged,
    looksLikeAddress: signals.looksLikeAddress || looksLikeAddress,
    doneAddingItems: signals.doneAddingItems || doneAddingItems,
  };
}

export function buildEmptyDetectedSignals(text: string | undefined): DetectedSignals {
  return {
    normalizedText: normalizeText(text),
    numericSelection: null,
    isGreeting: false,
    wantsMenu: false,
    wantsOrderStatus: false,
    humanRequested: false,
    fulfillmentType: null,
    paymentMethod: null,
    confirmation: null,
    wantsElectronicBilling: false,
    billingDataChanged: false,
    looksLikeAddress: false,
    cannotShareLocation: false,
    hasTransferProofCandidate: false,
    doneAddingItems: false,
  };
}

export function buildSemanticOptions(item: Pick<SemanticParserResult["items"][number], "optionTexts" | "notes">): Record<string, unknown> | undefined {
  const options: Record<string, unknown> = {};

  if (item.optionTexts && item.optionTexts.length > 0) {
    options.optionTexts = item.optionTexts;
  }

  if (item.notes && item.notes.length > 0) {
    options.notes = item.notes;
  }

  return Object.keys(options).length > 0 ? options : undefined;
}

export function draftReadyForSummary(draft: DraftOrder): draft is DraftOrder & { paymentMethod: PaymentMethod } {
  return Boolean(
    draft.billing?.type &&
    draft.paymentMethod &&
    draft.fulfillmentType &&
    (draft.fulfillmentType === "pickup" || draft.deliveryAddress || draft.deliveryAddressId),
  );
}

export function isActiveOrderState(state: Conversation["state"]): boolean {
  return [
    "awaiting_guided_item_selection",
    "awaiting_product_configuration",
    "awaiting_more_items",
    "awaiting_fulfillment_type",
    "awaiting_address",
    "awaiting_billing_reuse_confirmation",
    "awaiting_normal_billing_info",
    "awaiting_electronic_billing_info",
    "awaiting_payment_method",
    "awaiting_confirmation",
    "awaiting_transfer_proof",
    "awaiting_transfer_fallback_payment_method",
  ].includes(state);
}

function parseSemanticConfirmation(text: string | null | undefined): "yes" | "no" | "change" | null {
  const normalized = normalizeText(text ?? undefined);
  if (!normalized) return null;
  if (["si", "sii", "sip", "confirmo", "confirmado", "correcto", "dale", "listo", "ok", "okay"].includes(normalized)) return "yes";
  if (["no", "nop", "nope", "cancelar"].includes(normalized)) return "no";
  if (["cambiar", "corregir", "editar", "ajustar"].includes(normalized)) return "change";
  return null;
}

function isSemanticGreeting(parsed: SemanticParserResult): boolean {
  return parsed.textDirectives?.isGreeting === true
    && (parsed.textDirectives.greetingConfidence ?? 0) >= 0.75;
}
