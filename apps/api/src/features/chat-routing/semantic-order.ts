import type { DraftOrder, MenuItem, TodayMenuPayload } from "@42day/types";
import type { DetectedSignals } from "../../modules/message-router/signal-detector";
import type {
  SemanticOrderEditAction,
  SemanticParserAttemptEvent,
  SemanticParserExecution,
  SemanticParserResult,
} from "../../modules/semantic-parser/semantic-parser";
import { parseFreeFormOrder } from "../../modules/semantic-parser/semantic-parser";
import { getOrCreateActiveDraftOrder, removeItemsFromDraftOrder, setDraftOrderItemQuantity } from "../draft-orders/service";
import {
  buildLlmEscalationMessage,
  buildLlmTemporaryFailureMessage,
  buildManualHandoffMessage,
  buildOrderAdjustedPrompt,
} from "../../modules/message-router/response-composer";
import { resolveMenuSelectionFromText, resolveMenuSelectionsFromText } from "../menu/service";
import {
  clearLlmFailureContext,
  markLlmAttempt,
  markLlmAttemptFailure,
  markLlmAttemptSuccess,
  markLlmOutcome,
  recordStateAfter,
  recordStateBefore,
  recordStateDelta,
  traceRaw,
} from "./tracing";
import { loadCurrentMenu, mergeSemanticSignals, draftReadyForSummary, buildGuidedContext } from "./helpers";
import { moveToManual } from "./manual-handoff";
import { applyKnownSignalsToDraft, proceedToNextOrderStep } from "./checkout";
import { stageConfiguredItemSelection } from "./guided-selection";
import { updateConversationContext, updateConversationState } from "../conversations/service";
import { sendAndLogText } from "./outbound";
import type { LlmErrorClass, RouteInboundMessageInput, StateDeltaTrace } from "./types";

export async function tryHandleSemanticOrder(input: RouteInboundMessageInput, signals: DetectedSignals): Promise<boolean> {
  const menu = await loadCurrentMenu(input);
  const handledFastPath = await tryApplyDeterministicDelta(input, { menu, signals });
  if (handledFastPath) {
    return true;
  }

  let execution: SemanticParserExecution;

  try {
    execution = await parseFreeFormOrder({
      env: input.env,
      tenantId: input.tenant.id,
      rawMessage: input.message.text ?? signals.normalizedText,
      activeMenu: menu,
      conversationState: input.conversation.state,
      observeAttempt: (event) => observeSemanticAttempt(input, event),
    });
  } catch (error) {
    return handleSemanticFailure(input, error);
  }

  await clearLlmFailureContext(input);

  const parsed = execution.parsed;

  if (parsed.needsHuman || parsed.intent === "support") {
    markLlmOutcome(input, {
      used: true,
      outcome: "handled",
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
      parsed,
      reason: !menu.location ? "menu_location_missing" : "confidence_below_threshold",
    });
    return false;
  }

  const semanticSignals = mergeSemanticSignals(signals, parsed);

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
      parsed,
      reason: parsed.intent !== "order" ? "intent_not_order" : "empty_items",
    });
    return false;
  }

  let updatedDraft: DraftOrder | null = null;
  let lastSelectedItem: MenuItem | null = null;
  let resolvedCount = 0;
  let beforeDraft: DraftOrder | null = null;

  for (const [index, item] of parsed.items.entries()) {
    const resolved = resolveMenuSelectionFromText(menu, item.productText);
    const selectedItem = resolved?.item ?? null;
    if (!selectedItem) {
      recordStateDelta(input, {
        applied: false,
        reasonCode: "semantic_item_not_resolved",
        source: "semantic",
        itemName: item.productText,
      });
      continue;
    }

    beforeDraft = beforeDraft ?? (await loadDraftForLogging(input, menu));
    if (beforeDraft && !input.routingTrace?.state?.before) {
      recordStateBefore(input, beforeDraft, {
        source: "semantic",
        reasonCode: "semantic_order_apply_started",
      });
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

    const quantity = Math.max(1, Math.round(item.quantity ?? resolved?.quantity ?? 1));
    const stageResult = await stageConfiguredItemSelection(input, {
      menu,
      selectedItem,
      quantity,
      source: "semantic",
      rawItemText: item.productText,
      rawOptionTexts: item.optionTexts,
      notes: item.notes,
      queuedItems,
    });
    if (stageResult.kind === "prompted") {
      recordStateDelta(input, {
        applied: false,
        reasonCode: "semantic_order_clarification_requested",
        source: "semantic",
        itemName: selectedItem.displayName ?? selectedItem.product?.name ?? item.productText,
        quantity,
      });
      markLlmOutcome(input, {
        used: true,
        outcome: "handled",
        parsed,
        reason: "semantic_order_clarification_requested",
      });
      return true;
    }

    if (stageResult.kind !== "added") {
      recordStateDelta(input, {
        applied: false,
        reasonCode: "semantic_order_stage_failed",
        source: "semantic",
        itemName: selectedItem.displayName ?? selectedItem.product?.name ?? item.productText,
        quantity,
      });
      continue;
    }

    lastSelectedItem = selectedItem;
    resolvedCount += 1;
    updatedDraft = stageResult.draft;
    recordStateDelta(input, {
      applied: true,
      reasonCode: "semantic_item_added",
      source: "semantic",
      itemName: selectedItem.displayName ?? selectedItem.product?.name ?? item.productText,
      quantity,
      subtotal: stageResult.draft.subtotal,
    });
  }

  if (!updatedDraft || !lastSelectedItem || resolvedCount === 0) {
    markLlmOutcome(input, {
      used: false,
      outcome: "unresolved",
      parsed,
      reason: "items_not_resolved_against_menu",
    });
    return false;
  }

  recordStateAfter(input, updatedDraft, {
    source: "semantic",
    reasonCode: "semantic_order_applied",
  });

  markLlmOutcome(input, {
    used: true,
    outcome: "handled",
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

  recordStateBefore(input, draft, {
    source: "semantic",
    reasonCode: "semantic_edit_started",
  });

  let updatedDraft = draft;
  let changed = false;
  let contextItem: MenuItem | null = null;

  for (const action of actions) {
    if (action.confidence !== undefined && action.confidence < 0.45) {
      recordStateDelta(input, {
        applied: false,
        reasonCode: "semantic_edit_low_confidence",
        source: "semantic",
        itemName: action.productText ?? action.targetText ?? null,
      });
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
      recordStateDelta(input, {
        applied: result.changed,
        reasonCode: result.changed ? "semantic_item_removed" : "semantic_remove_target_missing",
        source: "semantic",
        itemName: targetItem?.displayName ?? targetItem?.product?.name ?? targetText ?? null,
        quantity: action.quantity ?? null,
        subtotal: result.draft.subtotal,
      });
      continue;
    }

    if (action.type === "set_quantity") {
      const targetText = action.targetText ?? action.productText ?? undefined;
      const targetItem = targetText ? resolveMenuSelectionFromText(payload.menu, targetText)?.item ?? null : null;
      if (!action.quantity && action.quantity !== 0) {
        recordStateDelta(input, {
          applied: false,
          reasonCode: "semantic_quantity_missing",
          source: "semantic",
          itemName: targetItem?.displayName ?? targetItem?.product?.name ?? targetText ?? null,
        });
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
      recordStateDelta(input, {
        applied: result.changed,
        reasonCode: result.changed ? "semantic_quantity_updated" : "semantic_quantity_target_missing",
        source: "semantic",
        itemName: targetItem?.displayName ?? targetItem?.product?.name ?? targetText ?? null,
        quantity: action.quantity ?? null,
        subtotal: result.draft.subtotal,
      });
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
      recordStateDelta(input, {
        applied: removeResult.changed,
        reasonCode: removeResult.changed ? "semantic_replace_target_removed" : "semantic_replace_target_missing",
        source: "semantic",
        itemName: targetItem?.displayName ?? targetItem?.product?.name ?? targetText ?? null,
        subtotal: removeResult.draft.subtotal,
      });
    }

    const productText = action.productText ?? undefined;
    const resolved = productText ? resolveMenuSelectionFromText(payload.menu, productText) : null;
    const selectedItem = resolved?.item ?? null;
    if (!selectedItem) {
      recordStateDelta(input, {
        applied: false,
        reasonCode: "semantic_edit_item_not_resolved",
        source: "semantic",
        itemName: productText ?? null,
      });
      continue;
    }

    const quantity = Math.max(1, Math.round(action.quantity ?? resolved?.quantity ?? 1));
    const stageResult = await stageConfiguredItemSelection(input, {
      menu: payload.menu,
      selectedItem,
      quantity,
      source: "semantic",
      rawItemText: productText,
      rawOptionTexts: action.optionTexts,
      notes: action.notes,
    });
    if (stageResult.kind === "prompted") {
      recordStateDelta(input, {
        applied: false,
        reasonCode: "semantic_edit_clarification_requested",
        source: "semantic",
        itemName: selectedItem.displayName ?? selectedItem.product?.name ?? productText,
        quantity,
      });
      markLlmOutcome(input, {
        used: true,
        outcome: "handled",
        parsed: payload.parsed,
        reason: "semantic_edit_clarification_requested",
      });
      return true;
    }
    if (stageResult.kind !== "added") {
      recordStateDelta(input, {
        applied: false,
        reasonCode: "semantic_edit_stage_failed",
        source: "semantic",
        itemName: selectedItem.displayName ?? selectedItem.product?.name ?? productText,
        quantity,
      });
      continue;
    }

    updatedDraft = stageResult.draft;
    changed = true;
    contextItem = selectedItem;
    recordStateDelta(input, {
      applied: true,
      reasonCode: "semantic_item_added",
      source: "semantic",
      itemName: selectedItem.displayName ?? selectedItem.product?.name ?? productText,
      quantity,
      subtotal: stageResult.draft.subtotal,
    });
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

  updatedDraft = await applyKnownSignalsToDraft(input, {
    menu: payload.menu,
    draft: updatedDraft,
    signals: payload.signals,
  });

  recordStateAfter(input, updatedDraft, {
    source: "semantic",
    reasonCode: "semantic_edit_applied",
  });

  markLlmOutcome(input, {
    used: true,
    outcome: "handled",
    parsed: payload.parsed,
    reason: "semantic_edit_applied",
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

async function tryApplyDeterministicDelta(input: RouteInboundMessageInput, payload: {
  menu: TodayMenuPayload;
  signals: DetectedSignals;
}): Promise<boolean> {
  const rawText = input.message.text?.trim() ?? "";
  if (!rawText || !looksLikeSimpleDelta(rawText, payload.signals)) {
    return false;
  }

  const selections = resolveMenuSelectionsFromText(payload.menu, rawText);
  if (selections.length === 0) {
    return false;
  }

  const beforeDraft = await loadDraftForLogging(input, payload.menu);
  recordStateBefore(input, beforeDraft, {
    source: "fast_path",
    reasonCode: "deterministic_delta_started",
  });

  let updatedDraft: DraftOrder | null = null;
  let lastSelectedItem: MenuItem | null = null;

  for (const selection of selections) {
    const stageResult = await stageConfiguredItemSelection(input, {
      menu: payload.menu,
      selectedItem: selection.item,
      quantity: selection.quantity,
      source: "guided",
      rawItemText: selection.item.displayName ?? selection.item.product?.name ?? undefined,
    });

    if (stageResult.kind === "prompted") {
      recordStateDelta(input, {
        applied: false,
        reasonCode: "deterministic_delta_clarification_requested",
        source: "fast_path",
        itemName: selection.item.displayName ?? selection.item.product?.name ?? null,
        quantity: selection.quantity,
      });
      markLlmOutcome(input, {
        used: false,
        outcome: "handled",
        reason: "deterministic_delta_clarification_requested",
        responseSource: "deterministic",
      });
      return true;
    }

    if (stageResult.kind !== "added") {
      recordStateDelta(input, {
        applied: false,
        reasonCode: "deterministic_delta_stage_failed",
        source: "fast_path",
        itemName: selection.item.displayName ?? selection.item.product?.name ?? null,
        quantity: selection.quantity,
      });
      continue;
    }

    updatedDraft = stageResult.draft;
    lastSelectedItem = selection.item;
    recordStateDelta(input, {
      applied: true,
      reasonCode: "deterministic_delta_applied",
      source: "fast_path",
      itemName: selection.item.displayName ?? selection.item.product?.name ?? null,
      quantity: selection.quantity,
      subtotal: stageResult.draft.subtotal,
    });
  }

  if (!updatedDraft || !lastSelectedItem) {
    return false;
  }

  recordStateAfter(input, updatedDraft, {
    source: "fast_path",
    reasonCode: "deterministic_delta_applied",
  });

  markLlmOutcome(input, {
    used: false,
    outcome: "handled",
    reason: "deterministic_fast_path_applied",
    responseSource: "deterministic",
  });

  await clearLlmFailureContext(input);
  await continueAfterSemanticEdit(input, {
    menu: payload.menu,
    draft: updatedDraft,
    signals: payload.signals,
    contextItem: lastSelectedItem,
  });
  return true;
}

function looksLikeSimpleDelta(text: string, signals: DetectedSignals): boolean {
  if (signals.fulfillmentType || signals.paymentMethod || signals.looksLikeAddress || signals.doneAddingItems) {
    return false;
  }

  return /^(y\s+)?(\d+|un|una|uno|dos|tres|cuatro|cinco|seis)\b/i.test(text) ||
    /\b(agrega|agregame|agregar|suma|sumale|añade|anade)\b/i.test(text);
}

function observeSemanticAttempt(input: RouteInboundMessageInput, event: SemanticParserAttemptEvent): void {
  if (event.type === "request") {
    markLlmAttempt(input, {
      provider: event.provider,
      model: event.model,
      attempt: event.attempt,
      route: event.route,
      inputPreview: event.inputPreview,
      estimatedInputTokens: event.estimatedInputTokens,
    });
    return;
  }

  if (event.type === "response") {
    if (event.raw) {
      traceRaw(input, "llm.raw", {
        provider: event.provider,
        model: event.model,
        attempt: event.attempt,
        route: event.route,
        raw: event.raw,
      });
    }

    markLlmAttemptSuccess(input, {
      provider: event.provider,
      model: event.model,
      attempt: event.attempt,
      route: event.route,
      latencyMs: event.latencyMs,
      parsed: event.parsed,
      preview: event.preview,
      outputHash: event.outputHash,
      finishReason: event.finishReason,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
    });
    return;
  }

  markLlmAttemptFailure(input, {
    provider: event.provider,
    model: event.model,
    attempt: event.attempt,
    route: event.route,
    latencyMs: event.latencyMs,
    errorClass: event.errorClass,
    reasonCode: event.reasonCode,
    message: event.message,
  });
}

async function handleSemanticFailure(input: RouteInboundMessageInput, error: unknown): Promise<boolean> {
  const reason = error instanceof Error ? error.message : String(error);
  const errorClass = input.routingTrace?.llm?.errorClass ?? classifyFailureFromReason(reason);
  markLlmOutcome(input, {
    used: false,
    outcome: "skipped_or_failed",
    reason,
    errorClass,
  });

  if (errorClass !== "transient_capacity") {
    return false;
  }

  const failureStreak = await persistTransientFailure(input, reason, errorClass);
  if (input.env.APP_ENV === "production" && failureStreak >= 2) {
    await moveToManual(input, {
      type: "validation_failed_repeatedly",
      manualReason: "semantic_parser_transient_capacity",
      title: "Fallo repetido del modelo automatico",
      description: reason,
      responseText: buildLlmEscalationMessage(),
      metadata: {
        traceId: input.routingTrace?.traceId,
        errorClass,
        llm: input.routingTrace?.llm,
      },
    });
    return true;
  }

  input.routingTrace = {
    ...(input.routingTrace ?? {}),
    blockFurtherRouting: true,
    pendingUserUtterance: input.message.text ?? null,
  };

  await sendAndLogText(input, buildLlmTemporaryFailureMessage(input.env.APP_ENV));
  return true;
}

async function persistTransientFailure(
  input: RouteInboundMessageInput,
  reason: string,
  errorClass: LlmErrorClass,
): Promise<number> {
  const current = input.conversation.context ?? {};
  const nextFailureStreak = Number(current.llmFailureStreak ?? 0) + 1;
  const nextContext = {
    ...current,
    llmFailureStreak: nextFailureStreak,
    pendingUserUtterance: input.message.text ?? null,
    lastLlmFailureAt: new Date().toISOString(),
    lastLlmErrorClass: errorClass,
    lastLlmFailureReason: reason,
  };

  input.conversation.context = nextContext;
  await updateConversationContext({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    context: nextContext,
  }).catch(() => undefined);

  return nextFailureStreak;
}

function classifyFailureFromReason(reason: string): LlmErrorClass {
  const normalized = reason.toLowerCase();

  if (normalized.includes("high demand") || normalized.includes("unavailable")) {
    return "transient_capacity";
  }

  if (normalized.includes("quota") || normalized.includes("rate limit") || normalized.includes("free tier")) {
    return "quota_exceeded";
  }

  if (normalized.includes("timeout")) {
    return "timeout";
  }

  if (normalized.includes("auth") || normalized.includes("credential") || normalized.includes("api key")) {
    return "provider_auth";
  }

  if (normalized.includes("json") || normalized.includes("schema")) {
    return "schema_invalid";
  }

  return "unknown_provider_failure";
}

async function loadDraftForLogging(input: RouteInboundMessageInput, menu: TodayMenuPayload): Promise<DraftOrder> {
  return getOrCreateActiveDraftOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversation: input.conversation,
    customerId: input.conversation.customerId,
    locationId: menu.location?.id,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  });
}
