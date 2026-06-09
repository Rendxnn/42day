import type { Conversation, DraftOrder, MenuItem, PaymentMethod, TodayMenuPayload } from "@42day/types";
import type { DetectedSignals } from "../../modules/message-router/signal-detector";
import type { SemanticParserResult } from "../../modules/semantic-parser/semantic-parser";
import { parseFulfillmentSelection, parsePaymentMethod } from "../../modules/message-router/signal-detector";
import { loadTodayPublishedMenu } from "../menu/service";
import type { RouteInboundMessageInput } from "./types";

export function shouldTrySemanticAtState(state: Conversation["state"], signals: DetectedSignals): boolean {
  if (!signals.shouldTrySemanticOrder) {
    return false;
  }

  if (state === "awaiting_address" && signals.looksLikeAddress) {
    return false;
  }

  return [
    "awaiting_guided_item_selection",
    "awaiting_mode_selection",
    "awaiting_more_items",
    "awaiting_fulfillment_type",
    "awaiting_address",
    "awaiting_payment_method",
    "awaiting_confirmation",
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

export function resolveReplacementOptionSelection(input: {
  normalizedText: string;
  numericSelection: number | null;
  replacementOptions: Array<{
    menuItemId: string;
    name: string;
    price?: number;
  }>;
}): {
  menuItemId: string;
  name: string;
  price?: number;
} | null {
  if (input.numericSelection !== null) {
    const option = input.replacementOptions[input.numericSelection - 1];
    return option ?? null;
  }

  if (!input.normalizedText) {
    return null;
  }

  const exactMatch = input.replacementOptions.find(
    (option) => normalizeReplacementSelectionText(option.name) === input.normalizedText,
  );
  if (exactMatch) {
    return exactMatch;
  }

  const partialMatches = input.replacementOptions.filter((option) => {
    const normalizedName = normalizeReplacementSelectionText(option.name);
    return normalizedName.includes(input.normalizedText) || input.normalizedText.includes(normalizedName);
  });

  return partialMatches.length === 1 ? (partialMatches[0] ?? null) : null;
}

export function mergeSemanticSignals(signals: DetectedSignals, parsed: SemanticParserResult): DetectedSignals {
  const fulfillmentText = parsed.fulfillmentText ?? undefined;
  const paymentText = parsed.paymentText ?? undefined;

  return {
    ...signals,
    fulfillmentType: signals.fulfillmentType ?? (fulfillmentText ? parseFulfillmentSelection(fulfillmentText, "awaiting_guided_item_selection") : null),
    paymentMethod: signals.paymentMethod ?? (paymentText ? parsePaymentMethod(paymentText, "awaiting_guided_item_selection") : null),
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
    "awaiting_payment_method",
    "awaiting_confirmation",
    "awaiting_transfer_proof",
  ].includes(state);
}

function normalizeReplacementSelectionText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
