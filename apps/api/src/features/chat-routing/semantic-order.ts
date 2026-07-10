import type { DraftOrder, MenuItem, TodayMenuPayload } from "@42day/types";
import type { DetectedSignals } from "../../modules/message-router/signal-detector";
import type { SemanticOrderEditAction, SemanticParserResult } from "../../modules/semantic-parser/semantic-parser";
import { parseFreeFormOrder } from "../../modules/semantic-parser/semantic-parser";
import { getOrCreateActiveDraftOrder, removeItemsFromDraftOrder, setDraftOrderItemQuantity } from "../draft-orders/service";
import { buildOrderAdjustedPrompt, buildManualHandoffMessage } from "../../modules/message-router/response-composer";
import { buildMenuText, resolveMenuSelectionFromText } from "../menu/service";
import { markLlmAttempt, markLlmOutcome } from "./tracing";
import { loadCurrentMenu, mergeSemanticSignals, draftReadyForSummary, buildGuidedContext } from "./helpers";
import { moveToManual } from "./manual-handoff";
import { applyKnownSignalsToDraft, proceedToNextOrderStep } from "./checkout";
import { stageConfiguredItemSelection } from "./guided-selection";
import { updateConversationState } from "../conversations/service";
import { sendAndLogText } from "./outbound";
import type { RouteInboundMessageInput } from "./types";

export async function tryHandleSemanticOrder(input: RouteInboundMessageInput, signals: DetectedSignals): Promise<boolean> {
  const menu = await loadCurrentMenu(input);
  let parsed: SemanticParserResult;
  let providerId: "gemini" | "openrouter" = "gemini";

  try {
    markLlmAttempt(input);
    const execution = await parseFreeFormOrder({
      env: input.env,
      tenantId: input.tenant.id,
      rawMessage: input.message.text ?? signals.normalizedText,
      activeMenu: menu,
      conversationState: input.conversation.state,
    });
    parsed = execution.parsed;
    providerId = execution.providerId;
    console.info("semantic_parser.completed", {
      tenantId: input.tenant.id,
      conversationId: input.conversation.id,
      inboundProviderMessageId: input.message.providerMessageId,
      provider: execution.providerId,
      fallbackFromProviderId: execution.fallbackFromProviderId,
      parsed,
    });
  } catch (error) {
    markLlmOutcome(input, {
      used: false,
      outcome: "skipped_or_failed",
      provider: providerId,
      reason: error instanceof Error ? error.message : String(error),
    });
    console.info("semantic_parser.skipped_or_failed", {
      tenantId: input.tenant.id,
      reason: error instanceof Error ? error.message : String(error),
    });
    return false;
  }

  if (parsed.needsHuman || parsed.intent === "support") {
    markLlmOutcome(input, {
      used: true,
      outcome: "handled",
      provider: providerId,
      parsed,
      reason: "support_or_handoff",
    });
    await moveToManual(input, {
      type: "parser_failed",
      manualReason: "parser_requested_human",
      title: "Pedido necesita revision",
      description: "El parser semantico marco la conversacion para revision humana.",
      responseText: buildManualHandoffMessage(),
    });
    return true;
  }

  if (parsed.confidence < 0.55 || !menu.location) {
    markLlmOutcome(input, {
      used: false,
      outcome: "low_confidence",
      provider: providerId,
      parsed,
      reason: !menu.location ? "menu_location_missing" : "confidence_below_threshold",
    });
    return false;
  }

  const semanticSignals = mergeSemanticSignals(signals, parsed);

  if (parsed.intent === "menu") {
    markLlmOutcome(input, {
      used: true,
      outcome: "handled",
      provider: providerId,
      parsed,
      reason: "semantic_menu_question",
    });

    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_guided_item_selection",
      context: {
        flow: "semantic_menu",
        activeMenuId: menu.menu?.id,
        activeLocationId: menu.location?.id,
        questions: parsed.questions ?? [],
      },
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(input, buildMenuText(menu));
    return true;
  }

  if (parsed.intent === "order_edit") {
    const handledEdit = await tryApplySemanticEdit(input, {
      menu,
      parsed,
      signals: semanticSignals,
    });
    if (handledEdit) {
      return true;
    }
  }

  if (parsed.intent !== "order" || parsed.items.length === 0) {
    markLlmOutcome(input, {
      used: false,
      outcome: "not_order",
      provider: providerId,
      parsed,
      reason: parsed.intent !== "order" ? "intent_not_order" : "empty_items",
    });
    return false;
  }

  let updatedDraft: DraftOrder | null = null;
  let lastSelectedItem: MenuItem | null = null;
  let resolvedCount = 0;

  for (const [index, item] of parsed.items.entries()) {
    const resolved = resolveMenuSelectionFromText(menu, item.productText);
    const selectedItem = resolved?.item ?? null;
    if (!selectedItem) {
      continue;
    }

    const queuedItems = parsed.items.slice(index + 1).flatMap((queuedItem) => {
      const queuedSelection = resolveMenuSelectionFromText(menu, queuedItem.productText);
      if (!queuedSelection) {
        return [];
      }

      return [{
        menuItemId: queuedSelection.item.id,
        quantity: Math.max(1, Math.round(queuedItem.quantity ?? queuedSelection.quantity ?? 1)),
        source: "semantic" as const,
        rawItemText: queuedItem.productText,
        rawOptionTexts: queuedItem.optionTexts,
        notes: queuedItem.notes,
      }];
    });

    const stageResult = await stageConfiguredItemSelection(input, {
      menu,
      selectedItem,
      quantity: Math.max(1, Math.round(item.quantity ?? resolved?.quantity ?? 1)),
      source: "semantic",
      rawItemText: item.productText,
      rawOptionTexts: item.optionTexts,
      notes: item.notes,
      queuedItems,
    });
    if (stageResult.kind === "prompted") {
      markLlmOutcome(input, {
        used: true,
        outcome: "handled",
        provider: providerId,
        parsed,
        reason: "semantic_order_clarification_requested",
      });
      return true;
    }

    if (stageResult.kind !== "added") {
      continue;
    }

    lastSelectedItem = selectedItem;
    resolvedCount += 1;
    updatedDraft = stageResult.draft;
  }

  if (!updatedDraft || !lastSelectedItem || resolvedCount === 0) {
    markLlmOutcome(input, {
      used: false,
      outcome: "unresolved",
      provider: providerId,
      parsed,
      reason: "items_not_resolved_against_menu",
    });
    return false;
  }

  markLlmOutcome(input, {
    used: true,
    outcome: "handled",
    provider: providerId,
    parsed,
    reason: "semantic_order_applied",
  });

  await continueAfterSemanticEdit(input, {
    menu,
    draft: updatedDraft,
    signals: semanticSignals,
    contextItem: lastSelectedItem,
  });
  return true;
}

async function tryApplySemanticEdit(input: RouteInboundMessageInput, payload: {
  menu: TodayMenuPayload;
  parsed: SemanticParserResult;
  signals: DetectedSignals;
}): Promise<boolean> {
  const draft = await getOrCreateActiveDraftOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversation: input.conversation,
    customerId: input.conversation.customerId,
    locationId: payload.menu.location?.id,
    deliveryFeeFixed: payload.menu.location?.deliveryFeeFixed,
  });
  const actions = normalizeSemanticEditActions(payload.parsed);

  if (actions.length === 0) {
    return false;
  }

  let updatedDraft = draft;
  let changed = false;
  let contextItem: MenuItem | null = null;

  for (const action of actions) {
    if (action.confidence !== undefined && action.confidence < 0.45) {
      continue;
    }

    if (action.type === "remove") {
      const targetText = action.targetText ?? action.productText ?? undefined;
      const targetItem = targetText ? resolveMenuSelectionFromText(payload.menu, targetText)?.item ?? null : null;
      const result = await removeItemsFromDraftOrder({
        env: input.env,
        schemaName: input.tenant.schemaName,
        draftOrderId: updatedDraft.id,
        menuItem: targetItem ?? undefined,
        targetText,
        quantity: action.quantity ?? undefined,
        deliveryFeeFixed: payload.menu.location?.deliveryFeeFixed,
      });

      updatedDraft = result.draft;
      changed = changed || result.changed;
      contextItem = contextItem ?? targetItem;
      continue;
    }

    if (action.type === "set_quantity") {
      const targetText = action.targetText ?? action.productText ?? undefined;
      const targetItem = targetText ? resolveMenuSelectionFromText(payload.menu, targetText)?.item ?? null : null;
      if (!action.quantity && action.quantity !== 0) {
        continue;
      }

      const result = await setDraftOrderItemQuantity({
        env: input.env,
        schemaName: input.tenant.schemaName,
        draftOrderId: updatedDraft.id,
        menuItem: targetItem ?? undefined,
        targetText,
        quantity: action.quantity,
        deliveryFeeFixed: payload.menu.location?.deliveryFeeFixed,
      });

      updatedDraft = result.draft;
      changed = changed || result.changed;
      contextItem = contextItem ?? targetItem;
      continue;
    }

    if (action.type === "replace") {
      const targetText = action.targetText ?? undefined;
      const targetItem = targetText ? resolveMenuSelectionFromText(payload.menu, targetText)?.item ?? null : null;
      const removeResult = await removeItemsFromDraftOrder({
        env: input.env,
        schemaName: input.tenant.schemaName,
        draftOrderId: updatedDraft.id,
        menuItem: targetItem ?? undefined,
        targetText,
        deliveryFeeFixed: payload.menu.location?.deliveryFeeFixed,
      });

      updatedDraft = removeResult.draft;
      changed = changed || removeResult.changed;
      contextItem = contextItem ?? targetItem;
    }

    const productText = action.productText ?? undefined;
    const resolved = productText ? resolveMenuSelectionFromText(payload.menu, productText) : null;
    const selectedItem = resolved?.item ?? null;
    if (!selectedItem) {
      continue;
    }

    const stageResult = await stageConfiguredItemSelection(input, {
      menu: payload.menu,
      selectedItem,
      quantity: Math.max(1, Math.round(action.quantity ?? resolved?.quantity ?? 1)),
      source: "semantic",
      rawItemText: productText,
      rawOptionTexts: action.optionTexts,
      notes: action.notes,
    });
    if (stageResult.kind === "prompted") {
      markLlmOutcome(input, {
        used: true,
        outcome: "handled",
        parsed: payload.parsed,
        reason: "semantic_edit_clarification_requested",
      });
      return true;
    }
    if (stageResult.kind !== "added") {
      continue;
    }

    updatedDraft = stageResult.draft;
    changed = true;
    contextItem = selectedItem;
  }

  if (!changed) {
    markLlmOutcome(input, {
      used: false,
      outcome: "unresolved",
      parsed: payload.parsed,
      reason: "edit_actions_not_applied",
    });
    return false;
  }

  markLlmOutcome(input, {
    used: true,
    outcome: "handled",
    parsed: payload.parsed,
    reason: "semantic_edit_applied",
  });

  updatedDraft = await applyKnownSignalsToDraft(input, {
    menu: payload.menu,
    draft: updatedDraft,
    signals: payload.signals,
  });

  await continueAfterSemanticEdit(input, {
    menu: payload.menu,
    draft: updatedDraft,
    signals: payload.signals,
    contextItem,
  });
  return true;
}

function normalizeSemanticEditActions(parsed: SemanticParserResult): SemanticOrderEditAction[] {
  const actions = [...(parsed.editActions ?? [])];

  if (actions.length === 0 && parsed.items.length > 0) {
    actions.push(
      ...parsed.items.map((item) => ({
        type: "add" as const,
        productText: item.productText,
        quantity: item.quantity,
        confidence: item.confidence,
        optionTexts: item.optionTexts,
        notes: item.notes,
      })),
    );
  }

  return actions;
}

async function continueAfterSemanticEdit(input: RouteInboundMessageInput, payload: {
  menu: TodayMenuPayload;
  draft: DraftOrder;
  signals: DetectedSignals;
  contextItem: MenuItem | null;
}): Promise<void> {
  const context = payload.contextItem ? buildGuidedContext(payload.menu, payload.contextItem) : undefined;

  if (payload.draft.items.length === 0) {
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_guided_item_selection",
      context,
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(input, buildOrderAdjustedPrompt(payload.draft));
    return;
  }

  if (payload.signals.fulfillmentType || payload.signals.paymentMethod) {
    await proceedToNextOrderStep(input, {
      menu: payload.menu,
      draft: payload.draft,
      context,
    });
    return;
  }

  if (input.conversation.state === "awaiting_confirmation" && draftReadyForSummary(payload.draft)) {
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_confirmation",
      context,
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(input, buildOrderAdjustedPrompt(payload.draft));
    return;
  }

  await updateConversationState({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    state: "awaiting_more_items",
    context,
    resetClarificationAttempts: true,
  }).catch(() => undefined);

  await sendAndLogText(input, buildOrderAdjustedPrompt(payload.draft));
}
