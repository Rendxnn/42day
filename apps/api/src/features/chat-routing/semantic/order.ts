import type { DraftOrder, MenuItem, TodayMenuPayload } from "@42day/types";
import type { DetectedSignals } from "../../../modules/message-router/signal-detector";
import type { SemanticOrderEditAction, SemanticParserResult, SemanticTextDirectives } from "../../../modules/semantic-parser/semantic-parser";
import { parseFreeFormOrder, parseSemanticStateDirectives } from "../../../modules/semantic-parser/semantic-parser";
import { getOrCreateActiveDraftOrder, removeItemsFromDraftOrder, setDraftOrderItemQuantity } from "../../draft-orders/service";
import {
  buildClarificationPrompt,
  buildContinueWithMenuAndDraftPrompt,
  buildElectronicBillingUnavailableMessage,
  buildManualHandoffMessage,
  buildOrderAdjustedPrompt,
  buildResumeExistingOrderPrompt,
} from "../../../modules/message-router/response-composer";
import { buildMenuText, buildWelcomeMenuText, resolveMenuSelectionFromText } from "../../menu/service";
import { logRoutingDiagnostic, markLlmAttempt, markLlmOutcome, redactSemanticParserResult } from "../shared/tracing";
import { canApplySemanticDraftChangeAtState, loadCurrentMenu, mergeSemanticSignals, draftReadyForSummary, buildGuidedContext, buildEmptyDetectedSignals, isActiveOrderState } from "../shared/helpers";
import { moveToManual } from "../manual/handoff";
import {
  applyDraftFacts,
  applyKnownSignalsToDraft,
  proceedToNextOrderStep,
  tryHandleBillingReuseConfirmation,
  tryHandleConfirmation,
  tryHandleDeliveryAddress,
  tryHandleFulfillmentSelection,
  isElectronicBillingEnabled,
  tryHandlePaymentMethod,
} from "../checkout";
import { stageConfiguredItemSelection } from "../guided/selection";
import { updateConversationState } from "../../conversations/service";
import { sendAndLogText } from "../outbound/send";
import type { RouteInboundMessageInput } from "../shared/types";
import { buildSemanticDraftFacts, hasDraftFacts } from "./draft-facts";
import { tryHandlePendingProductConfiguration, readPendingProductConfiguration } from "../guided/product-configuration";
import { tryHandleReplacementSelection } from "../replacements/selection";
import { tryHandleTransferFallbackPaymentMethod } from "../transfer/fallback";
import { readPendingBillingContext } from "../checkout/billing-helpers";
import { getPendingCustomerReplacementOrder } from "../../orders/service";
import { loadRecentConversationMessages } from "../../../modules/message-log/message-log";

export async function tryHandleSemanticOrder(input: RouteInboundMessageInput): Promise<boolean> {
  const menu = await loadCurrentMenu(input);
  const baseSignals = buildEmptyDetectedSignals(input.message.text);
  let parsed: SemanticParserResult;
  let providerId: "gemini" | "openrouter" = "gemini";

  try {
    markLlmAttempt(input);
    const execution = await parseFreeFormOrder({
      env: input.env,
      tenantId: input.tenant.id,
      rawMessage: input.message.text ?? baseSignals.normalizedText,
      activeMenu: menu,
      conversationState: input.conversation.state,
      stateContext: await buildSemanticStateContext(input, menu),
    });
    parsed = execution.parsed;
    providerId = execution.providerId;
    parsed = await enrichStateDirectivesIfNeeded(input, parsed);
    logRoutingDiagnostic(input, "semantic_parser.completed", {
      provider: execution.providerId,
      fallbackFromProviderId: execution.fallbackFromProviderId,
      parsed: redactSemanticParserResult(parsed),
    });
  } catch (error) {
    markLlmOutcome(input, {
      used: false,
      outcome: "skipped_or_failed",
      provider: providerId,
      reason: error instanceof Error ? error.message : String(error),
    });
    logRoutingDiagnostic(input, "semantic_parser.skipped_or_failed", {
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

  const semanticSignals = mergeSemanticSignals(baseSignals, parsed);

  const canApplyDraftChange = canApplySemanticDraftChangeAtState(input.conversation.state);
  const draftFacts = buildSemanticDraftFacts(parsed, semanticSignals);
  logRoutingDiagnostic(input, "semantic_draft_facts.evaluated", {
    canApplyDraftChange,
    proposedFacts: redactSemanticParserResult(parsed).draftFacts ?? null,
    acceptedFacts: {
      fulfillmentType: draftFacts.fulfillmentType ?? null,
      paymentMethod: draftFacts.paymentMethod ?? null,
      hasDeliveryAddress: Boolean(draftFacts.deliveryAddressText),
      billingType: draftFacts.billing?.type ?? null,
    },
  });

  if (await tryHandleSemanticStateResponse(input, {
    menu,
    parsed,
    semanticSignals,
    providerId,
  })) {
    return true;
  }

  if (draftFacts.billing?.type === "electronic" && !(await isElectronicBillingEnabled(input, menu.location?.id))) {
    await sendAndLogText(input, buildElectronicBillingUnavailableMessage());
    markLlmOutcome(input, {
      used: true,
      outcome: "handled",
      provider: providerId,
      parsed,
      reason: "electronic_billing_disabled",
    });
    return true;
  }

  if (canApplyDraftChange && hasDraftFacts(draftFacts) && (parsed.intent === "unknown" || parsed.items.length === 0)) {
    const draft = await getOrCreateActiveDraftOrder({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversation: input.conversation,
      customerId: input.conversation.customerId,
      locationId: menu.location?.id,
      deliveryFeeFixed: menu.location?.deliveryFeeFixed,
    });
    const updatedDraft = await applyDraftFacts(input, { menu, draft, facts: draftFacts });
    if (draftFacts.deliveryAddressText?.trim() && updatedDraft.fulfillmentType === "delivery") {
      await tryHandleDeliveryAddress(input, {
        looksLikeAddress: true,
        addressText: draftFacts.deliveryAddressText,
        addressDetails: draftFacts.deliveryAddressDetails ?? undefined,
        paymentMethod: draftFacts.paymentMethod,
      });
      markLlmOutcome(input, {
        used: true,
        outcome: "handled",
        provider: providerId,
        parsed,
        reason: "semantic_delivery_address_validated",
      });
      return true;
    }
    markLlmOutcome(input, {
      used: true,
      outcome: "handled",
      provider: providerId,
      parsed,
      reason: "semantic_draft_facts_applied",
    });
    await proceedToNextOrderStep(input, { menu, draft: updatedDraft });
    return true;
  }

  if ((parsed.intent === "menu" || semanticSignals.isGreeting) && canApplyDraftChange) {
    markLlmOutcome(input, {
      used: true,
      outcome: "handled",
      provider: providerId,
      parsed,
      reason: semanticSignals.isGreeting ? "semantic_greeting" : "semantic_menu_question",
    });
    await handleSemanticGreetingOrMenu(input, menu, semanticSignals.isGreeting);
    return true;
  }

  if (parsed.intent === "order_edit" && canApplyDraftChange) {
    const handledEdit = await tryApplySemanticEdit(input, {
      menu,
      parsed,
      signals: semanticSignals,
    });
    if (handledEdit) {
      return true;
    }
  }

  if (parsed.intent !== "order" || parsed.items.length === 0 || !canApplyDraftChange) {
    markLlmOutcome(input, {
      used: false,
      outcome: "not_order",
      provider: providerId,
      parsed,
      reason: !canApplyDraftChange
        ? "semantic_action_not_allowed_in_current_state"
        : parsed.intent !== "order" ? "intent_not_order" : "empty_items",
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
      logRoutingDiagnostic(input, "semantic_draft_item_unresolved", { itemIndex: index, productText: item.productText });
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
    logRoutingDiagnostic(input, "semantic_draft_item_stage_result", {
      itemIndex: index,
      productText: item.productText,
      selectedMenuItemId: selectedItem.id,
      result: stageResult.kind,
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

  updatedDraft = await applyDraftFacts(input, { menu, draft: updatedDraft, facts: draftFacts });

  if (draftFacts.deliveryAddressText?.trim() && updatedDraft.fulfillmentType === "delivery") {
    await tryHandleDeliveryAddress(input, {
      looksLikeAddress: true,
      addressText: draftFacts.deliveryAddressText,
      addressDetails: draftFacts.deliveryAddressDetails ?? undefined,
      paymentMethod: draftFacts.paymentMethod,
    });
    return true;
  }

  await continueAfterSemanticEdit(input, {
    menu,
    draft: updatedDraft,
    signals: semanticSignals,
    contextItem: lastSelectedItem,
  });
  return true;
}

async function tryHandleSemanticStateResponse(input: RouteInboundMessageInput, payload: {
  menu: TodayMenuPayload;
  parsed: SemanticParserResult;
  semanticSignals: DetectedSignals;
  providerId: "gemini" | "openrouter";
}): Promise<boolean> {
  if (input.conversation.state === "awaiting_product_configuration") {
    const handled = await tryHandlePendingProductConfiguration(input, {
      semanticAnswer: payload.parsed.textDirectives?.productConfiguration?.confidence !== undefined
        && payload.parsed.textDirectives.productConfiguration.confidence < 0.6
        ? null
        : payload.parsed.textDirectives?.productConfiguration
          ? {
              optionTexts: payload.parsed.textDirectives.productConfiguration.optionTexts,
              notes: payload.parsed.textDirectives.productConfiguration.notes,
              confidence: payload.parsed.textDirectives.productConfiguration.confidence,
            }
          : null,
      signals: payload.semanticSignals,
    });
    if (handled) {
      markLlmOutcome(input, {
        used: true,
        outcome: "handled",
        provider: payload.providerId,
        parsed: payload.parsed,
        reason: "semantic_product_configuration_applied",
      });
      logRoutingDiagnostic(input, "semantic_state.product_configuration_applied", {});
      return true;
    }
  }

  if (input.conversation.state === "awaiting_replacement_selection") {
    const replacementSignals = {
      ...payload.semanticSignals,
      confirmation: payload.parsed.textDirectives?.replacementRejectAll ? "no" : payload.semanticSignals.confirmation,
    };
    const handled = await tryHandleReplacementSelection(input, replacementSignals, {
      selectionText: payload.parsed.textDirectives?.replacementChoiceText ?? null,
    });
    if (handled) {
      markLlmOutcome(input, {
        used: true,
        outcome: "handled",
        provider: payload.providerId,
        parsed: payload.parsed,
        reason: "semantic_replacement_selection_applied",
      });
      logRoutingDiagnostic(input, "semantic_state.replacement_applied", {
        replacementChoiceText: payload.parsed.textDirectives?.replacementChoiceText ?? null,
        rejectedAll: payload.parsed.textDirectives?.replacementRejectAll ?? false,
      });
      return true;
    }
  }

  if (input.conversation.state === "awaiting_transfer_fallback_payment_method") {
    const transferSignals = {
      ...payload.semanticSignals,
      paymentMethod: mapTransferFallbackPayment(payload.parsed),
      confirmation: mapTransferFallbackConfirmation(payload.parsed),
    };
    const handled = await tryHandleTransferFallbackPaymentMethod(input, transferSignals);
    if (handled) {
      markLlmOutcome(input, {
        used: true,
        outcome: "handled",
        provider: payload.providerId,
        parsed: payload.parsed,
        reason: "semantic_transfer_fallback_applied",
      });
      logRoutingDiagnostic(input, "semantic_state.transfer_fallback_applied", {
        transferFallbackDecision: payload.parsed.textDirectives?.transferFallbackDecision ?? null,
      });
      return true;
    }
  }

  if (input.conversation.state === "awaiting_transfer_proof") {
    return false;
  }

  if (
    input.conversation.state === "awaiting_address"
    && (
      payload.parsed.addressText?.trim()
      || payload.parsed.draftFacts?.deliveryAddressText?.trim()
    )
  ) {
    const handled = await tryHandleDeliveryAddress(input, {
      looksLikeAddress: true,
      addressText: payload.parsed.addressText?.trim() ?? payload.parsed.draftFacts?.deliveryAddressText?.trim(),
      addressDetails: payload.parsed.addressDetails?.trim() ?? payload.parsed.draftFacts?.deliveryAddressDetails?.trim(),
      paymentMethod: payload.semanticSignals.paymentMethod,
    });
    if (handled) {
      markLlmOutcome(input, {
        used: true,
        outcome: "handled",
        provider: payload.providerId,
        parsed: payload.parsed,
        reason: "semantic_delivery_address_applied",
      });
      logRoutingDiagnostic(input, "semantic_state.address_applied", {});
      return true;
    }
  }

  if (input.conversation.state === "awaiting_more_items" && payload.semanticSignals.doneAddingItems) {
    await proceedToNextOrderStep(input);
    markLlmOutcome(input, {
      used: true,
      outcome: "handled",
      provider: payload.providerId,
      parsed: payload.parsed,
      reason: "semantic_continue_checkout",
    });
    logRoutingDiagnostic(input, "semantic_state.continue_checkout_applied", {});
    return true;
  }

  if (
    input.conversation.state === "awaiting_more_items"
    || input.conversation.state === "awaiting_fulfillment_type"
    || input.conversation.state === "awaiting_confirmation"
  ) {
    const handled = await tryHandleFulfillmentSelection(input, payload.semanticSignals);
    if (handled) {
      markLlmOutcome(input, {
        used: true,
        outcome: "handled",
        provider: payload.providerId,
        parsed: payload.parsed,
        reason: "semantic_fulfillment_applied",
      });
      logRoutingDiagnostic(input, "semantic_state.fulfillment_applied", {
        fulfillmentType: payload.semanticSignals.fulfillmentType ?? null,
      });
      return true;
    }
  }

  if (input.conversation.state === "awaiting_billing_reuse_confirmation") {
    const handled = await tryHandleBillingReuseConfirmation(input, {
      ...payload.semanticSignals,
      billingDecision: payload.parsed.textDirectives?.billingDecision ?? null,
    });
    if (handled) {
      markLlmOutcome(input, {
        used: true,
        outcome: "handled",
        provider: payload.providerId,
        parsed: payload.parsed,
        reason: "semantic_billing_reuse_applied",
      });
      logRoutingDiagnostic(input, "semantic_state.billing_reuse_applied", {
        billingDecision: payload.parsed.textDirectives?.billingDecision ?? null,
      });
      return true;
    }
  }

  if (input.conversation.state === "awaiting_payment_method" || input.conversation.state === "awaiting_confirmation") {
    const handled = await tryHandlePaymentMethod(input, payload.semanticSignals);
    if (handled) {
      markLlmOutcome(input, {
        used: true,
        outcome: "handled",
        provider: payload.providerId,
        parsed: payload.parsed,
        reason: "semantic_payment_applied",
      });
      logRoutingDiagnostic(input, "semantic_state.payment_applied", {
        paymentMethod: payload.semanticSignals.paymentMethod ?? null,
      });
      return true;
    }
  }

  if (input.conversation.state === "awaiting_confirmation") {
    const handled = await tryHandleConfirmation(input, payload.semanticSignals);
    if (handled) {
      markLlmOutcome(input, {
        used: true,
        outcome: "handled",
        provider: payload.providerId,
        parsed: payload.parsed,
        reason: "semantic_confirmation_applied",
      });
      logRoutingDiagnostic(input, "semantic_state.confirmation_applied", {
        confirmation: payload.semanticSignals.confirmation ?? null,
      });
      return true;
    }
  }

  return false;
}

async function handleSemanticGreetingOrMenu(
  input: RouteInboundMessageInput,
  menu: TodayMenuPayload,
  isGreeting: boolean,
): Promise<void> {
  if (isActiveOrderState(input.conversation.state) && input.conversation.currentDraftOrderId) {
    const draft = await getOrCreateActiveDraftOrder({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversation: input.conversation,
      customerId: input.conversation.customerId,
      locationId: menu.location?.id,
      deliveryFeeFixed: menu.location?.deliveryFeeFixed,
    });

    if (draft.items.length > 0) {
      if (!isGreeting) {
        await updateConversationState({
          env: input.env,
          schemaName: input.tenant.schemaName,
          conversationId: input.conversation.id,
          state: "awaiting_more_items",
          resetClarificationAttempts: true,
        }).catch(() => undefined);

        await sendAndLogText(input, buildContinueWithMenuAndDraftPrompt(buildMenuText(menu), draft));
        return;
      }

      await sendAndLogText(input, buildResumeExistingOrderPrompt(draft, buildClarificationPrompt(input.conversation.state)));
      return;
    }
  }

  await updateConversationState({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    state: "awaiting_guided_item_selection",
    context: {
      flow: "guided",
      activeMenuId: menu.menu?.id,
      activeLocationId: menu.location?.id,
    },
    resetClarificationAttempts: true,
  }).catch(() => undefined);

  await sendAndLogText(
    input,
    isGreeting ? buildWelcomeMenuText(menu, input.tenant.name) : buildMenuText(menu),
  );
}

async function buildSemanticStateContext(input: RouteInboundMessageInput, menu: TodayMenuPayload): Promise<Record<string, unknown>> {
  const context: Record<string, unknown> = {};
  const [lastOutboundMessage] = await loadRecentConversationMessages({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    direction: "outbound",
    limit: 1,
  });

  if (lastOutboundMessage?.text) {
    context.lastAssistantPrompt = lastOutboundMessage.text;
  }

  const pendingBilling = readPendingBillingContext(input.conversation.context);
  if (pendingBilling) {
    context.pendingBilling = {
      type: pendingBilling.type,
      hasReusableProfile: Boolean(pendingBilling.reuseProfile),
      expectedActions: ["reuse", "change", "switch_to_electronic"],
    };
  }

  const pendingConfig = readPendingProductConfiguration(input.conversation);
  if (pendingConfig) {
    const item = menu.items.find((entry) => entry.id === pendingConfig.menuItemId);
    const option = item?.product?.options?.find((entry) => entry.id === pendingConfig.pendingOptionId);
    context.pendingProductConfiguration = {
      itemName: item?.displayName ?? item?.product?.name ?? null,
      optionName: option?.name ?? pendingConfig.pendingOptionName,
      optionType: option?.type ?? pendingConfig.pendingOptionType,
      values: option?.type === "text"
        ? []
        : option?.values.filter((value) => value.isActive).map((value) => value.name) ?? [],
      expectedActions: ["answer_pending_option"],
    };
  }

  if (input.conversation.state === "awaiting_replacement_selection") {
    const pendingReplacement = await getPendingCustomerReplacementOrder({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      currentDraftOrderId: input.conversation.currentDraftOrderId,
    }).catch(() => null);
    if (pendingReplacement) {
      context.pendingReplacement = {
        replacementOptions: pendingReplacement.replacementOptions.map((option) => option.name),
        expectedActions: ["choose_replacement", "reject_all"],
      };
    }
  }

  if (input.conversation.state === "awaiting_more_items") {
    context.expectedActions = ["add_more_items", "continue_checkout"];
  }

  if (input.conversation.state === "awaiting_confirmation") {
    context.expectedActions = ["confirm_order", "change_order", "reject_confirmation"];
  }

  if (input.conversation.state === "awaiting_transfer_fallback_payment_method") {
    context.expectedActions = ["accept_cash_fallback", "insist_on_transfer"];
  }

  return context;
}

async function enrichStateDirectivesIfNeeded(
  input: RouteInboundMessageInput,
  parsed: SemanticParserResult,
): Promise<SemanticParserResult> {
  if (!needsStateDirectiveOverlay(input.conversation.state, parsed)) {
    return parsed;
  }

  const stateContext = await buildSemanticStateContext(input, await loadCurrentMenu(input));
  const directiveExecution = await parseSemanticStateDirectives({
    env: input.env,
    tenantId: input.tenant.id,
    rawMessage: input.message.text ?? "",
    conversationState: input.conversation.state,
    stateContext,
  });

  const mergedDirectives = {
    ...(parsed.textDirectives ?? {}),
    ...directiveExecution.directives,
  } satisfies SemanticTextDirectives;

  logRoutingDiagnostic(input, "semantic_state_directives.completed", {
    provider: directiveExecution.providerId,
    fallbackFromProviderId: directiveExecution.fallbackFromProviderId,
    directives: redactSemanticStateDirectives(mergedDirectives),
  });

  return {
    ...parsed,
    textDirectives: mergedDirectives,
  };
}

function mapTransferFallbackPayment(parsed: SemanticParserResult): "cash" | "transfer" | null {
  const decision = parsed.textDirectives?.transferFallbackDecision;
  if (decision === "cash" || decision === "confirm_cash") return "cash";
  if (decision === "transfer" || decision === "reject_cash") return "transfer";
  return null;
}

function mapTransferFallbackConfirmation(parsed: SemanticParserResult): "yes" | "no" | "change" | null {
  const decision = parsed.textDirectives?.transferFallbackDecision;
  if (decision === "confirm_cash") return "yes";
  if (decision === "reject_cash") return "no";
  return parsed.textDirectives?.confirmation ?? null;
}

function needsStateDirectiveOverlay(
  state: RouteInboundMessageInput["conversation"]["state"],
  parsed: SemanticParserResult,
): boolean {
  switch (state) {
    case "awaiting_billing_reuse_confirmation":
      return !parsed.textDirectives?.billingDecision && !parsed.textDirectives?.confirmation;
    case "awaiting_more_items":
      return parsed.textDirectives?.continueCheckout !== true;
    case "awaiting_confirmation":
      return !parsed.textDirectives?.confirmation;
    case "awaiting_replacement_selection":
      return !parsed.textDirectives?.replacementChoiceText && parsed.textDirectives?.replacementRejectAll !== true;
    case "awaiting_transfer_fallback_payment_method":
      return !parsed.textDirectives?.transferFallbackDecision;
    case "awaiting_product_configuration":
      return !parsed.textDirectives?.productConfiguration?.optionTexts?.length;
    default:
      return false;
  }
}

function redactSemanticStateDirectives(directives: SemanticTextDirectives): Record<string, unknown> {
  return {
    ...directives,
    replacementChoiceText: directives.replacementChoiceText ? "[redacted]" : directives.replacementChoiceText,
    productConfiguration: directives.productConfiguration
      ? {
          confidence: directives.productConfiguration.confidence,
          optionCount: directives.productConfiguration.optionTexts?.length ?? 0,
          noteCount: directives.productConfiguration.notes?.length ?? 0,
        }
      : directives.productConfiguration,
  };
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
