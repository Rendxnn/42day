import type {
  Conversation,
  DraftOrder,
  HumanInterventionType,
  MenuItem,
  OrderLineItemOptionTextInput,
  OrderLineItemResolvedOption,
  ProductOption,
  TodayMenuPayload,
} from "@42day/types";
import {
  addMenuItemToDraftOrder,
  getOrCreateActiveDraftOrder,
  removeItemsFromDraftOrder,
  setDraftOrderItemQuantity,
  updateDraftOrderDeliveryAddress,
  updateDraftOrderFulfillment,
  updateDraftOrderPaymentMethod,
} from "../draft-orders/service";
import { getLatestCustomerAddress, saveCustomerAddressFromText } from "../../modules/customer-address-service/customer-address-service";
import {
  incrementClarificationAttempts,
  updateConversationState,
} from "../conversations/service";
import {
  buildMenuText,
  buildWelcomeMenuText,
  loadTodayPublishedMenu,
  resolveMenuSelection,
  resolveMenuSelectionFromText,
  resolveMenuSelectionsFromText,
} from "../menu/service";
import {
  applyCustomerReplacementSelection,
  cancelPendingCustomerReplacementOrder,
  getPendingCustomerReplacementOrder,
  persistConfirmedOrder,
} from "../orders/service";
import { parseFreeFormOrder, type SemanticOrderEditAction, type SemanticParserResult } from "../../modules/semantic-parser/semantic-parser";
import { persistHumanInterventionAlert } from "../../modules/handoff-service/handoff-service";
import { detectSignals, type DetectedSignals } from "../../modules/message-router/signal-detector";
import { createSupabaseRestClient } from "../../lib/supabase-rest";
import {
  buildAddMorePrompt,
  buildAddressSaveFailedPrompt,
  buildAddressSavedPrompt,
  buildClarificationPrompt,
  buildContinueWithMenuAndDraftPrompt,
  buildCurrentDraftText,
  buildDeliveryAddressPrompt,
  buildEditableSummaryAdjustmentPrompt,
  buildEmptyDraftPrompt,
  buildFulfillmentPrompt,
  buildLocationCapturedForLaterMessage,
  buildManualHandoffMessage,
  buildMaxClarificationMessage,
  buildOrderAdjustedPrompt,
  buildOrderSubmittedForReviewMessage,
  buildOrderSummaryText,
  buildPaymentPrompt,
  buildPickupPaymentPrompt,
  buildProductConfigurationPrompt,
  buildReplacementAppliedMessage,
  buildReplacementCancelledMessage,
  buildReplacementOptionUnavailableMessage,
  buildReplacementOrderNotFoundMessage,
  buildReplacementSelectionPrompt,
  buildReplacementUnresolvedMessage,
  buildReplacementUpdateFailedMessage,
  buildRestaurantReviewPendingMessage,
  buildResumeExistingOrderPrompt,
  buildTransferProofReceivedMessage,
  buildTransferProofAttachmentPrompt,
  buildTransferProofProcessingFailedMessage,
  buildTransferProofUnsupportedFormatPrompt,
} from "../../modules/message-router/response-composer";
import {
  buildGuidedContext,
  draftReadyForSummary,
  isActiveOrderState,
  loadCurrentMenu,
  mergeSemanticSignals,
  resolveReplacementOptionSelection,
  shouldTrySemanticAtState,
} from "./helpers";
import { sendAndLogText } from "./outbound";
import {
  buildOrderLineItemOptionsSnapshot,
  resolveProductConfiguration,
  shouldPersistConfigurationSnapshot,
  splitConfigurationAnswerTexts,
  type ProductConfigurationResolution,
  type ProductConfigurationSource,
} from "../product-configurator/service";
import {
  storeInboundPaymentProof,
} from "../payment-proofs/service";
import {
  isTransferProofMediaMessage,
  isTransferProofUnsupportedMessage,
  looksLikeTransferProofNotice,
} from "../payment-proofs/helpers";
import { markLlmAttempt, markLlmOutcome } from "./tracing";
import type { ResponseRoutingTrace, RouteInboundMessageInput } from "./types";
export type { RouteInboundMessageInput } from "./types";

type ConfigurableItemCandidate = {
  menuItemId: string;
  quantity: number;
  source: ProductConfigurationSource;
  rawItemText?: string;
  rawOptionTexts?: OrderLineItemOptionTextInput[];
  notes?: string[];
};

type PendingProductConfigurationContext = {
  id: string;
  menuItemId: string;
  productId?: string;
  quantity: number;
  source: ProductConfigurationSource;
  rawItemText?: string;
  rawOptionTexts: OrderLineItemOptionTextInput[];
  notes: string[];
  resolvedOptions: OrderLineItemResolvedOption[];
  pendingOptionId: string;
  pendingOptionName: string;
  pendingOptionType: ProductOption["type"];
  invalidValueTexts?: string[];
  ambiguousValueTexts?: string[];
  startedAt: string;
  queuedItems?: ConfigurableItemCandidate[];
};

export async function routeInboundMessage(input: RouteInboundMessageInput): Promise<void> {
  input.routingTrace = {
    responseSource: "deterministic",
    responseReason: "route_started",
  };

  if (!input.tenant.automationEnabled) {
    console.info("tenant.automation_disabled", {
      tenantId: input.tenant.id,
      providerMessageId: input.message.providerMessageId,
    });
    return;
  }

  const signals = detectSignals({
    message: input.message,
    state: input.conversation.state,
  });

  if (input.conversation.state === "manual") {
    console.info("conversation.manual_auto_reply_skipped", {
      tenantId: input.tenant.id,
      conversationId: input.conversation.id,
      providerMessageId: input.message.providerMessageId,
    });
    return;
  }

  if (signals.humanRequested) {
    await moveToManual(input, {
      type: "support_requested",
      manualReason: "support_requested",
      title: "Cliente pidio asesor",
      description: "El cliente pidio hablar con alguien del restaurante.",
      responseText: buildManualHandoffMessage(),
    });
    return;
  }

  if (input.conversation.state === "awaiting_transfer_proof") {
    const handledTransferProof = await tryHandleTransferProof(input);
    if (handledTransferProof) {
      return;
    }
  }

  if (input.conversation.state === "awaiting_restaurant_confirmation") {
    await sendAndLogText(
      input,
      buildRestaurantReviewPendingMessage(),
    );
    return;
  }

  if (input.conversation.state === "awaiting_replacement_selection") {
    const handledReplacementSelection = await tryHandleReplacementSelection(input, signals);
    if (handledReplacementSelection) {
      return;
    }

    await handleReplacementSelectionClarification(input);
    return;
  }

  if (input.conversation.state === "awaiting_product_configuration") {
    const handledProductConfiguration = await tryHandlePendingProductConfiguration(input);
    if (handledProductConfiguration) {
      return;
    }
  }

  if (shouldTrySemanticAtState(input.conversation.state, signals)) {
    const handledSemantic = await tryHandleSemanticOrder(input, signals);
    if (handledSemantic) {
      return;
    }
  }

  if (
    input.conversation.state === "awaiting_guided_item_selection" ||
    input.conversation.state === "awaiting_mode_selection" ||
    input.conversation.state === "awaiting_more_items"
  ) {
    const handledSelection = await tryHandleGuidedSelection(input, signals);
    if (handledSelection) {
      return;
    }
  }

  if (input.conversation.state === "awaiting_more_items" && signals.doneAddingItems) {
    await proceedToNextOrderStep(input);
    return;
  }

  if (
    input.conversation.state === "awaiting_more_items" ||
    input.conversation.state === "awaiting_fulfillment_type" ||
    input.conversation.state === "awaiting_confirmation"
  ) {
    const handledFulfillment = await tryHandleFulfillmentSelection(input, signals);
    if (handledFulfillment) {
      return;
    }
  }

  if (
    input.conversation.state === "awaiting_address" ||
    (input.conversation.state === "awaiting_confirmation" && input.message.type === "location")
  ) {
    const handledAddress = await tryHandleDeliveryAddress(input, signals);
    if (handledAddress) {
      return;
    }
  }

  if (input.conversation.state === "awaiting_payment_method" || input.conversation.state === "awaiting_confirmation") {
    const handledPayment = await tryHandlePaymentMethod(input, signals);
    if (handledPayment) {
      return;
    }
  }

  if (input.conversation.state === "awaiting_confirmation") {
    const handledConfirmation = await tryHandleConfirmation(input, signals);
    if (handledConfirmation) {
      return;
    }
  }

  if (signals.isGreeting || signals.wantsMenu) {
    await handleGreetingOrMenu(input, signals.isGreeting);
    return;
  }

  if (input.message.type === "location" && input.message.location) {
    await sendAndLogText(
      input,
      buildLocationCapturedForLaterMessage(),
    );
    return;
  }

  await handleClarification(input, buildClarificationPrompt(input.conversation.state), "validation_failed_repeatedly");
}

async function handleGreetingOrMenu(input: RouteInboundMessageInput, isGreeting: boolean): Promise<void> {
  if (isActiveOrderState(input.conversation.state) && input.conversation.currentDraftOrderId) {
    const menu = await loadCurrentMenu(input);
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

  await showCurrentMenu(input, isGreeting);
}

async function showCurrentMenu(input: RouteInboundMessageInput, isGreeting: boolean): Promise<void> {
  const menu = await loadCurrentMenu(input);
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
    isGreeting ? buildWelcomeMenuText(menu) : buildMenuText(menu),
  );
}

async function tryHandleTransferProof(input: RouteInboundMessageInput): Promise<boolean> {
  if (isTransferProofMediaMessage(input.message)) {
    if (!input.loggedMessageId) {
      await moveToManual(input, {
        type: "technical_error",
        manualReason: "payment_proof_message_not_logged",
        title: "Comprobante sin mensaje asociado",
        description: "Llegó un comprobante de transferencia, pero no se pudo asociar al mensaje inbound persistido.",
        responseText: buildTransferProofProcessingFailedMessage(),
        metadata: {
          mediaId: input.message.mediaId ?? null,
          messageType: input.message.type,
        },
      });
      return true;
    }

    try {
      const result = await storeInboundPaymentProof({
        env: input.env,
        schemaName: input.tenant.schemaName,
        tenantSlug: input.tenant.slug,
        conversationId: input.conversation.id,
        currentDraftOrderId: input.conversation.currentDraftOrderId,
        loggedMessageId: input.loggedMessageId,
        message: input.message,
      });

      if (result.kind === "no_active_order") {
        await moveToManual(input, {
          type: "transfer_payment_review",
          manualReason: "no_active_transfer_order",
          title: "Comprobante sin orden activa",
          description: "El cliente envió un comprobante, pero no hay una orden con transferencia activa para asociarlo.",
          responseText: buildManualHandoffMessage(),
          metadata: {
            reason: "no_active_transfer_order",
            messageType: input.message.type,
            mediaId: input.message.mediaId ?? null,
          },
        });
        return true;
      }

      await moveToManual(input, {
        type: "transfer_payment_review",
        manualReason: "transfer_payment_review",
        title: "Comprobante pendiente por revisar",
        description: "El cliente envió un comprobante de transferencia y quedó pendiente de revisión humana.",
        responseText: buildTransferProofReceivedMessage(),
        orderId: result.orderId,
        draftOrderId: result.draftOrderId,
        metadata: {
          paymentProofId: result.paymentProof.id,
          duplicate: result.kind === "duplicate",
          replacedPaymentProofId: "replacedPaymentProofId" in result ? (result.replacedPaymentProofId ?? null) : null,
          mediaId: input.message.mediaId ?? null,
          messageType: input.message.type,
        },
      });
      return true;
    } catch (error) {
      console.error("payment_proof.processing_failed", {
        error: error instanceof Error ? error.message : String(error),
        conversationId: input.conversation.id,
        providerMessageId: input.message.providerMessageId,
      });

      await createSupabaseRestClient(input.env).insert({
        schema: input.tenant.schemaName,
        table: "app_events",
        rows: {
          conversation_id: input.conversation.id,
          draft_order_id: input.conversation.currentDraftOrderId ?? null,
          event_name: "payment_proof.processing_failed",
          severity: "error",
          source: "chat_routing",
          metadata: {
            providerMessageId: input.message.providerMessageId,
            mediaId: input.message.mediaId ?? null,
            reason: error instanceof Error ? error.message : String(error),
          },
        },
      }).catch(() => undefined);

      await moveToManual(input, {
        type: "technical_error",
        manualReason: "payment_proof_processing_failed",
        title: "Fallo procesando comprobante",
        description: "No se pudo descargar, almacenar o vincular el comprobante de transferencia automáticamente.",
        responseText: buildTransferProofProcessingFailedMessage(),
        metadata: {
          reason: error instanceof Error ? error.message : String(error),
          mediaId: input.message.mediaId ?? null,
          messageType: input.message.type,
        },
      });
      return true;
    }
  }

  if (isTransferProofUnsupportedMessage(input.message)) {
    await sendAndLogText(input, buildTransferProofUnsupportedFormatPrompt());
    return true;
  }

  if (looksLikeTransferProofNotice(input.message.text)) {
    await sendAndLogText(input, buildTransferProofAttachmentPrompt());
    return true;
  }

  return false;
}

async function tryHandleGuidedSelection(
  input: RouteInboundMessageInput,
  signals: DetectedSignals,
): Promise<boolean> {
  const menu = await loadCurrentMenu(input);
  const resolvedByNumber = signals.numericSelection !== null ? resolveMenuSelection(menu, signals.numericSelection) : null;
  const resolvedByTextList = !resolvedByNumber && signals.normalizedText ? resolveMenuSelectionsFromText(menu, signals.normalizedText) : [];
  const resolvedByText = resolvedByTextList.length === 1 ? resolvedByTextList[0] : null;
  const selectedItem = resolvedByNumber ?? resolvedByText?.item ?? null;
  const quantity = resolvedByText?.quantity ?? 1;

  if (!resolvedByNumber && resolvedByTextList.length > 1 && menu.location) {
    let updatedDraft: DraftOrder | null = null;
    let lastSelectedItem: MenuItem | null = null;

    for (const selection of resolvedByTextList) {
      const stageResult = await stageConfiguredItemSelection(input, {
        menu,
        selectedItem: selection.item,
        quantity: selection.quantity,
        source: "guided",
      });
      if (stageResult.kind === "prompted") {
        return true;
      }
      if (stageResult.kind === "added") {
        updatedDraft = stageResult.draft;
        lastSelectedItem = selection.item;
      }
    }

    if (updatedDraft && lastSelectedItem) {
      await continueAfterItemAdded(input, {
        menu,
        draft: updatedDraft,
        selectedItem: lastSelectedItem,
        quantity: 1,
        signals,
      });
      return true;
    }
  }

  if (!selectedItem || !menu.location) {
    return false;
  }

  const stageResult = await stageConfiguredItemSelection(input, {
    menu,
    selectedItem,
    quantity,
    source: "guided",
  });
  if (stageResult.kind === "prompted") {
    return true;
  }
  if (stageResult.kind !== "added") {
    return false;
  }

  await continueAfterItemAdded(input, {
    menu,
    draft: stageResult.draft,
    selectedItem,
    quantity,
    signals,
  });
  return true;
}

async function tryHandleSemanticOrder(input: RouteInboundMessageInput, signals: DetectedSignals): Promise<boolean> {
  const menu = await loadCurrentMenu(input);
  let parsed: SemanticParserResult;

  try {
    markLlmAttempt(input);
    parsed = await parseFreeFormOrder({
      env: input.env,
      tenantId: input.tenant.id,
      rawMessage: input.message.text ?? signals.normalizedText,
      activeMenu: menu,
      conversationState: input.conversation.state,
    });
  } catch (error) {
    markLlmOutcome(input, {
      used: false,
      outcome: "skipped_or_failed",
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

  for (const [index, item] of parsed.items.entries()) {
    const resolved = resolveMenuSelectionFromText(menu, item.productText);
    const selectedItem = resolved?.item ?? null;
    if (!selectedItem) {
      continue;
    }

    const queuedItems: ConfigurableItemCandidate[] = [];
    for (const queuedItem of parsed.items.slice(index + 1)) {
      const queuedSelection = resolveMenuSelectionFromText(menu, queuedItem.productText);
      if (!queuedSelection) {
        continue;
      }

      queuedItems.push({
        menuItemId: queuedSelection.item.id,
        quantity: Math.max(1, Math.round(queuedItem.quantity ?? queuedSelection.quantity ?? 1)),
        source: "semantic",
        rawItemText: queuedItem.productText,
        rawOptionTexts: queuedItem.optionTexts,
        notes: queuedItem.notes,
      });
    }

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
      parsed,
      reason: "items_not_resolved_against_menu",
    });
    return false;
  }

  markLlmOutcome(input, {
    used: true,
    outcome: "handled",
    parsed,
    reason: "semantic_order_applied",
  });

  await continueAfterItemAdded(input, {
    menu,
    draft: updatedDraft,
    selectedItem: lastSelectedItem,
    quantity: 1,
    signals: semanticSignals,
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

async function tryHandlePendingProductConfiguration(input: RouteInboundMessageInput): Promise<boolean> {
  const menu = await loadCurrentMenu(input);
  const pending = readPendingProductConfiguration(input.conversation);
  if (!pending) {
    return false;
  }

  const selectedItem = menu.items.find((item) => item.id === pending.menuItemId);
  if (!selectedItem) {
    await moveToManual(input, {
      type: "validation_failed_repeatedly",
      manualReason: "pending_product_configuration_missing_menu_item",
      title: "Configuracion pendiente sin producto",
      description: "El producto pendiente por configurar ya no pudo resolverse en el menu actual.",
      responseText: buildManualHandoffMessage(),
    });
    return true;
  }

  const option = selectedItem.product?.options?.find((entry) => entry.id === pending.pendingOptionId);
  if (!option) {
    await moveToManual(input, {
      type: "validation_failed_repeatedly",
      manualReason: "pending_product_configuration_missing_option",
      title: "Configuracion pendiente sin opcion",
      description: "La opcion pendiente por configurar ya no existe o no pudo cargarse.",
      responseText: buildManualHandoffMessage(),
    });
    return true;
  }

  const answerText = input.message.text?.trim() ?? "";
  const rawOptionTexts = mapConfigurationAnswerToRawOptionTexts(option, answerText);
  if (rawOptionTexts.length === 0) {
    await handleClarification(
      input,
      buildProductConfigurationPrompt(selectedItem.displayName ?? selectedItem.product?.name ?? "tu producto", option),
      "product_configuration_unresolved",
    );
    return true;
  }

  const resolution = resolveProductConfiguration({
    menuItem: selectedItem,
    source: pending.source,
    rawOptionTexts,
    freeTextNotes: pending.notes,
    existingResolvedOptions: pending.resolvedOptions,
    forcedOptionId: option.id,
  });

  const mergedRawOptionTexts = [...pending.rawOptionTexts, ...rawOptionTexts];

  if (resolution.status === "resolved") {
    const notes = uniqueNotes([...pending.notes, ...resolution.freeTextNotes]);
    let draft = await addSelectedItem(input, {
      menu,
      selectedItem,
      quantity: pending.quantity,
      options: shouldPersistConfigurationSnapshot({
        menuItem: selectedItem,
        resolution,
      })
        ? buildOrderLineItemOptionsSnapshot({
            ...resolution,
            rawOptionTexts: mergedRawOptionTexts,
            freeTextNotes: notes,
          })
        : undefined,
      notes: notes.join("; ") || undefined,
      unitPrice: resolution.pricing.resolvedUnitPrice,
    });

    let lastSelectedItem = selectedItem;
    const queuedResult = await processQueuedConfiguredItems(input, {
      menu,
      queuedItems: pending.queuedItems ?? [],
    });
    if (queuedResult.kind === "prompted") {
      return true;
    }
    if (queuedResult.kind === "added") {
      draft = queuedResult.draft ?? draft;
      lastSelectedItem = queuedResult.lastSelectedItem ?? lastSelectedItem;
    }

    await continueAfterItemAdded(input, {
      menu,
      draft,
      selectedItem: lastSelectedItem,
      quantity: pending.quantity,
      signals: detectSignals({
        message: input.message,
        state: input.conversation.state,
      }),
    });
    return true;
  }

  if (resolution.status === "needs_clarification" && resolution.nextOption?.id) {
    await persistPendingProductConfiguration(input, {
      menu,
      selectedItem,
      quantity: pending.quantity,
      source: pending.source,
      rawItemText: pending.rawItemText,
      rawOptionTexts: mergedRawOptionTexts,
      notes: uniqueNotes([...pending.notes, ...resolution.freeTextNotes]),
      resolution,
      queuedItems: pending.queuedItems,
    });
    return true;
  }

  await moveToManual(input, {
    type: "validation_failed_repeatedly",
    manualReason: "product_configuration_unresolved",
    title: "Producto requiere configuracion manual",
    description: "El bot no logro completar la configuracion del producto despues de varios intentos.",
    responseText: buildManualHandoffMessage(),
  });
  return true;
}

async function stageConfiguredItemSelection(input: RouteInboundMessageInput, payload: {
  menu: TodayMenuPayload;
  selectedItem: MenuItem;
  quantity: number;
  source: ProductConfigurationSource;
  rawItemText?: string;
  rawOptionTexts?: OrderLineItemOptionTextInput[];
  notes?: string[];
  queuedItems?: ConfigurableItemCandidate[];
}): Promise<{ kind: "added"; draft: DraftOrder } | { kind: "prompted" }> {
  const notes = uniqueNotes(payload.notes ?? []);
  const resolution = resolveProductConfiguration({
    menuItem: payload.selectedItem,
    source: payload.source,
    rawOptionTexts: payload.rawOptionTexts,
    freeTextNotes: notes,
  });

  if (resolution.status === "resolved") {
    return {
      kind: "added",
      draft: await addSelectedItem(input, {
        menu: payload.menu,
        selectedItem: payload.selectedItem,
        quantity: payload.quantity,
        options: shouldPersistConfigurationSnapshot({
          menuItem: payload.selectedItem,
          resolution,
        })
          ? buildOrderLineItemOptionsSnapshot(resolution)
          : undefined,
        notes: notes.join("; ") || undefined,
        unitPrice: resolution.pricing.resolvedUnitPrice,
      }),
    };
  }

  if (resolution.status === "needs_clarification" && resolution.nextOption?.id) {
    await persistPendingProductConfiguration(input, {
      menu: payload.menu,
      selectedItem: payload.selectedItem,
      quantity: payload.quantity,
      source: payload.source,
      rawItemText: payload.rawItemText,
      rawOptionTexts: resolution.rawOptionTexts,
      notes,
      resolution,
      queuedItems: payload.queuedItems,
    });
    return { kind: "prompted" };
  }

  await moveToManual(input, {
    type: "validation_failed_repeatedly",
    manualReason: "product_configuration_unresolved",
    title: "Producto requiere revision",
    description: "El producto tiene configuracion pendiente que el bot no logro resolver.",
    responseText: buildManualHandoffMessage(),
  });
  return { kind: "prompted" };
}

async function processQueuedConfiguredItems(input: RouteInboundMessageInput, payload: {
  menu: TodayMenuPayload;
  queuedItems: ConfigurableItemCandidate[];
}): Promise<{ kind: "added"; draft?: DraftOrder; lastSelectedItem?: MenuItem } | { kind: "prompted" }> {
  let latestDraft: DraftOrder | undefined;
  let lastSelectedItem: MenuItem | undefined;

  for (const [index, candidate] of payload.queuedItems.entries()) {
    const selectedItem = payload.menu.items.find((item) => item.id === candidate.menuItemId);
    if (!selectedItem) {
      continue;
    }

    const stageResult = await stageConfiguredItemSelection(input, {
      menu: payload.menu,
      selectedItem,
      quantity: candidate.quantity,
      source: candidate.source,
      rawItemText: candidate.rawItemText,
      rawOptionTexts: candidate.rawOptionTexts,
      notes: candidate.notes,
      queuedItems: payload.queuedItems.slice(index + 1),
    });
    if (stageResult.kind === "prompted") {
      return { kind: "prompted" };
    }

    latestDraft = stageResult.draft;
    lastSelectedItem = selectedItem;
  }

  return { kind: "added", draft: latestDraft, lastSelectedItem };
}

async function addSelectedItem(input: RouteInboundMessageInput, payload: {
  menu: TodayMenuPayload;
  selectedItem: MenuItem;
  quantity: number;
  options?: ReturnType<typeof buildOrderLineItemOptionsSnapshot>;
  notes?: string;
  unitPrice?: number;
}): Promise<DraftOrder> {
  const draft = await getOrCreateActiveDraftOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversation: input.conversation,
    customerId: input.conversation.customerId,
    locationId: payload.menu.location?.id,
    deliveryFeeFixed: payload.menu.location?.deliveryFeeFixed,
  });

  return addMenuItemToDraftOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    draftOrderId: draft.id,
    menuItem: payload.selectedItem,
    quantity: payload.quantity,
    options: payload.options,
    notes: payload.notes,
    unitPrice: payload.unitPrice,
    deliveryFeeFixed: payload.menu.location?.deliveryFeeFixed,
  });
}

async function continueAfterItemAdded(input: RouteInboundMessageInput, payload: {
  menu: TodayMenuPayload;
  draft: DraftOrder;
  selectedItem: MenuItem;
  quantity: number;
  signals: DetectedSignals;
}): Promise<void> {
  const draft = await applyKnownSignalsToDraft(input, {
    menu: payload.menu,
    draft: payload.draft,
    signals: payload.signals,
  });

  if (payload.signals.fulfillmentType || payload.signals.paymentMethod || input.conversation.state === "awaiting_confirmation") {
    await proceedToNextOrderStep(input, {
      menu: payload.menu,
      draft,
      context: buildGuidedContext(payload.menu, payload.selectedItem),
    });
    return;
  }

  await updateConversationState({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    state: "awaiting_more_items",
    context: buildGuidedContext(payload.menu, payload.selectedItem),
    resetClarificationAttempts: true,
  }).catch(() => undefined);

  await sendAndLogText(input, buildAddMorePrompt(draft));
}

async function applyKnownSignalsToDraft(input: RouteInboundMessageInput, payload: {
  menu: TodayMenuPayload;
  draft: DraftOrder;
  signals: DetectedSignals;
}): Promise<DraftOrder> {
  let draft = payload.draft;

  if (payload.signals.fulfillmentType) {
    draft = await updateDraftOrderFulfillment({
      env: input.env,
      schemaName: input.tenant.schemaName,
      draftOrderId: draft.id,
      fulfillmentType: payload.signals.fulfillmentType,
      deliveryFeeFixed: payload.menu.location?.deliveryFeeFixed,
    });
  }

  if (payload.signals.paymentMethod) {
    draft = await updateDraftOrderPaymentMethod({
      env: input.env,
      schemaName: input.tenant.schemaName,
      draftOrderId: draft.id,
      paymentMethod: payload.signals.paymentMethod,
      deliveryFeeFixed: payload.menu.location?.deliveryFeeFixed,
    });
  }

  return draft;
}

async function proceedToNextOrderStep(input: RouteInboundMessageInput, payload?: {
  menu?: TodayMenuPayload;
  draft?: DraftOrder;
  context?: Record<string, unknown>;
}): Promise<void> {
  const menu = payload?.menu ?? (await loadCurrentMenu(input));
  const draft = payload?.draft ?? (await getOrCreateActiveDraftOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversation: input.conversation,
    customerId: input.conversation.customerId,
    locationId: menu.location?.id,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  }));

  if (draft.items.length === 0) {
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_guided_item_selection",
      context: payload?.context,
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(input, buildEmptyDraftPrompt());
    return;
  }

  if (!draft.fulfillmentType) {
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_fulfillment_type",
      context: payload?.context,
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(input, [buildCurrentDraftText(draft), buildFulfillmentPrompt(menu)].join("\n\n"));
    return;
  }

  if (draft.fulfillmentType === "delivery" && !draft.deliveryAddress && !draft.deliveryAddressId) {
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_address",
      context: payload?.context,
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(input, buildDeliveryAddressPrompt());
    return;
  }

  if (!draft.paymentMethod) {
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_payment_method",
      context: payload?.context,
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(input, buildPaymentPrompt(draft, menu));
    return;
  }

  await updateConversationState({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    state: "awaiting_confirmation",
    context: payload?.context,
    resetClarificationAttempts: true,
  }).catch(() => undefined);

  await sendAndLogText(input, buildOrderSummaryText(draft, draft.paymentMethod));
}

async function tryHandleFulfillmentSelection(input: RouteInboundMessageInput, signals: DetectedSignals): Promise<boolean> {
  if (!signals.fulfillmentType) {
    return false;
  }

  const menu = await loadCurrentMenu(input);
  const draft = await getOrCreateActiveDraftOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversation: input.conversation,
    customerId: input.conversation.customerId,
    locationId: menu.location?.id,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  });

  let updatedDraft = await updateDraftOrderFulfillment({
    env: input.env,
    schemaName: input.tenant.schemaName,
    draftOrderId: draft.id,
    fulfillmentType: signals.fulfillmentType,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  });

  if (signals.paymentMethod) {
    updatedDraft = await updateDraftOrderPaymentMethod({
      env: input.env,
      schemaName: input.tenant.schemaName,
      draftOrderId: updatedDraft.id,
      paymentMethod: signals.paymentMethod,
      deliveryFeeFixed: menu.location?.deliveryFeeFixed,
    });
  }

  if (signals.fulfillmentType === "delivery") {
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_address",
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(input, buildDeliveryAddressPrompt());
    return true;
  }

  if (signals.paymentMethod) {
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_confirmation",
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(input, buildOrderSummaryText(updatedDraft, signals.paymentMethod));
    return true;
  }

  await updateConversationState({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    state: "awaiting_payment_method",
    resetClarificationAttempts: true,
  }).catch(() => undefined);

  await sendAndLogText(input, buildPickupPaymentPrompt(menu, updatedDraft));
  return true;
}

async function tryHandleDeliveryAddress(input: RouteInboundMessageInput, signals: DetectedSignals): Promise<boolean> {
  if (input.message.type !== "location" && !signals.looksLikeAddress) {
    return false;
  }

  const menu = await loadCurrentMenu(input);
  const draft = await getOrCreateActiveDraftOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversation: input.conversation,
    customerId: input.conversation.customerId,
    locationId: menu.location?.id,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  });

  const address =
    input.message.type === "location"
      ? await getLatestCustomerAddress({
          env: input.env,
          schemaName: input.tenant.schemaName,
          customerId: input.conversation.customerId,
        })
      : await saveCustomerAddressFromText({
          env: input.env,
          schemaName: input.tenant.schemaName,
          customerId: input.conversation.customerId,
          addressText: input.message.text ?? signals.normalizedText,
        });

  if (!address) {
    await handleClarification(
      input,
      buildAddressSaveFailedPrompt(),
      "validation_failed_repeatedly",
    );
    return true;
  }

  const updatedDraft = await updateDraftOrderDeliveryAddress({
    env: input.env,
    schemaName: input.tenant.schemaName,
    draftOrderId: draft.id,
    addressText: address.addressText,
    deliveryAddressId: address.id,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  });

  const paymentMethod = updatedDraft.paymentMethod ?? signals.paymentMethod;

  if (paymentMethod) {
    const draftWithPayment = updatedDraft.paymentMethod
      ? updatedDraft
      : await updateDraftOrderPaymentMethod({
          env: input.env,
          schemaName: input.tenant.schemaName,
          draftOrderId: updatedDraft.id,
          paymentMethod,
          deliveryFeeFixed: menu.location?.deliveryFeeFixed,
        });

    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_confirmation",
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(
      input,
      buildAddressSavedPrompt(address.addressText, buildOrderSummaryText(draftWithPayment, paymentMethod)),
    );
    return true;
  }

  await updateConversationState({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    state: "awaiting_payment_method",
    resetClarificationAttempts: true,
  }).catch(() => undefined);

  await sendAndLogText(
    input,
    buildAddressSavedPrompt(address.addressText, buildPaymentPrompt(updatedDraft, menu)),
  );
  return true;
}

async function tryHandlePaymentMethod(input: RouteInboundMessageInput, signals: DetectedSignals): Promise<boolean> {
  if (!signals.paymentMethod) {
    return false;
  }

  const menu = await loadCurrentMenu(input);
  const draft = await getOrCreateActiveDraftOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversation: input.conversation,
    customerId: input.conversation.customerId,
    locationId: menu.location?.id,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  });

  const updatedDraft = await updateDraftOrderPaymentMethod({
    env: input.env,
    schemaName: input.tenant.schemaName,
    draftOrderId: draft.id,
    paymentMethod: signals.paymentMethod,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  });

  await updateConversationState({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    state: "awaiting_confirmation",
    resetClarificationAttempts: true,
  }).catch(() => undefined);

  await sendAndLogText(input, buildOrderSummaryText(updatedDraft, signals.paymentMethod));
  return true;
}

async function tryHandleConfirmation(input: RouteInboundMessageInput, signals: DetectedSignals): Promise<boolean> {
  if (!signals.confirmation) {
    return false;
  }

  if (signals.confirmation === "no" || signals.confirmation === "change") {
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_more_items",
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(
      input,
      buildEditableSummaryAdjustmentPrompt(),
    );
    return true;
  }

  const menu = await loadCurrentMenu(input);
  const draft = await getOrCreateActiveDraftOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversation: input.conversation,
    customerId: input.conversation.customerId,
    locationId: menu.location?.id,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  });

  const order = await persistConfirmedOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    customerId: input.conversation.customerId,
    draft,
  });

  await updateConversationState({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    state: "awaiting_restaurant_confirmation",
    resetClarificationAttempts: true,
  }).catch(() => undefined);

  await sendAndLogText(
    input,
    buildOrderSubmittedForReviewMessage(order.id, draft.paymentMethod),
  );
  return true;
}

async function tryHandleReplacementSelection(
  input: RouteInboundMessageInput,
  signals: DetectedSignals,
): Promise<boolean> {
  const pendingReplacement = await getPendingCustomerReplacementOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    currentDraftOrderId: input.conversation.currentDraftOrderId,
  });

  if (!pendingReplacement) {
    await moveToManual(input, {
      type: "technical_error",
      manualReason: "replacement_order_not_found",
      title: "No se encontro el pedido para reemplazo",
      description: "La conversacion estaba esperando reemplazo, pero no se encontro una orden en ese estado.",
      responseText: buildReplacementOrderNotFoundMessage(),
    });
    return true;
  }

  if (signals.confirmation === "no") {
    await cancelPendingCustomerReplacementOrder({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      currentDraftOrderId: input.conversation.currentDraftOrderId,
    });

    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "completed",
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(input, buildReplacementCancelledMessage());
    return true;
  }

  const selectedReplacement = resolveReplacementOptionSelection({
    normalizedText: signals.normalizedText,
    numericSelection: signals.numericSelection,
    replacementOptions: pendingReplacement.replacementOptions,
  });

  if (!selectedReplacement) {
    return false;
  }

  try {
    const result = await applyCustomerReplacementSelection({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      currentDraftOrderId: input.conversation.currentDraftOrderId,
      selectedReplacementMenuItemId: selectedReplacement.menuItemId,
    });

    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_restaurant_confirmation",
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(
      input,
      buildReplacementAppliedMessage(result.unavailableItemName, result.selectedReplacement.name),
    );
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const replacementBecameUnavailable =
      reason === "order.customer_replacement_menu_item_unavailable" ||
      reason === "order.customer_replacement_product_inactive";

    await moveToManual(input, {
      type: replacementBecameUnavailable ? "order_change_requested" : "technical_error",
      manualReason: replacementBecameUnavailable ? "replacement_option_no_longer_available" : "replacement_selection_failed",
      title: replacementBecameUnavailable
        ? "Reemplazo ya no disponible"
        : "No fue posible aplicar el reemplazo",
      description: replacementBecameUnavailable
        ? "La opcion elegida por el cliente ya no estaba disponible al procesar la respuesta."
        : "El sistema no pudo actualizar la orden despues de la seleccion del cliente.",
      responseText: replacementBecameUnavailable
        ? buildReplacementOptionUnavailableMessage()
        : buildReplacementUpdateFailedMessage(),
    });
    return true;
  }
}

async function handleReplacementSelectionClarification(input: RouteInboundMessageInput): Promise<void> {
  const pendingReplacement = await getPendingCustomerReplacementOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    currentDraftOrderId: input.conversation.currentDraftOrderId,
  });

  if (!pendingReplacement) {
    await moveToManual(input, {
      type: "technical_error",
      manualReason: "replacement_order_not_found",
      title: "No se encontro el pedido para reemplazo",
      description: "La conversacion estaba esperando reemplazo, pero no se encontro una orden en ese estado.",
      responseText: buildReplacementOrderNotFoundMessage(),
    });
    return;
  }

  if (input.conversation.clarificationAttempts >= 2) {
    await moveToManual(input, {
      type: "order_change_requested",
      manualReason: "replacement_selection_unresolved",
      title: "Cliente no eligio reemplazo claro",
      description: "El cliente no eligio un reemplazo interpretable despues de varios intentos.",
      responseText: buildReplacementUnresolvedMessage(),
    });
    return;
  }

  await incrementClarificationAttempts({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
  }).catch(() => undefined);

  await sendAndLogText(input, buildReplacementSelectionPrompt(pendingReplacement.replacementOptions));
}

async function persistPendingProductConfiguration(input: RouteInboundMessageInput, payload: {
  menu: TodayMenuPayload;
  selectedItem: MenuItem;
  quantity: number;
  source: ProductConfigurationSource;
  rawItemText?: string;
  rawOptionTexts: OrderLineItemOptionTextInput[];
  notes: string[];
  resolution: ProductConfigurationResolution;
  queuedItems?: ConfigurableItemCandidate[];
}): Promise<void> {
  const nextOption = payload.resolution.nextOption;
  if (!nextOption?.id) {
    throw new Error("product_configuration.next_option_missing");
  }

  await updateConversationState({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    state: "awaiting_product_configuration",
    context: {
      ...input.conversation.context,
      pendingConfig: {
        id: crypto.randomUUID(),
        menuItemId: payload.selectedItem.id,
        productId: payload.selectedItem.productId ?? payload.selectedItem.product?.id,
        quantity: payload.quantity,
        source: payload.source,
        rawItemText: payload.rawItemText,
        rawOptionTexts: payload.rawOptionTexts,
        notes: payload.notes,
        resolvedOptions: payload.resolution.resolvedOptions,
        pendingOptionId: nextOption.id,
        pendingOptionName: nextOption.name,
        pendingOptionType: nextOption.type,
        invalidValueTexts: payload.resolution.invalidValueTexts,
        ambiguousValueTexts: payload.resolution.ambiguousValueTexts,
        startedAt: new Date().toISOString(),
        queuedItems: payload.queuedItems,
      } satisfies PendingProductConfigurationContext,
    },
    resetClarificationAttempts: true,
  }).catch(() => undefined);

  await sendAndLogText(
    input,
    buildProductConfigurationPrompt(
      payload.selectedItem.displayName ?? payload.selectedItem.product?.name ?? "tu producto",
      nextOption,
      {
        invalidValueTexts: payload.resolution.invalidValueTexts,
        ambiguousValueTexts: payload.resolution.ambiguousValueTexts,
      },
    ),
  );
}

function readPendingProductConfiguration(conversation: Conversation): PendingProductConfigurationContext | null {
  const candidate = conversation.context?.pendingConfig;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const pending = candidate as Partial<PendingProductConfigurationContext>;
  if (!pending.menuItemId || !pending.pendingOptionId || !pending.source) {
    return null;
  }

  return {
    id: pending.id ?? crypto.randomUUID(),
    menuItemId: pending.menuItemId,
    productId: pending.productId,
    quantity: Math.max(1, Math.round(pending.quantity ?? 1)),
    source: pending.source,
    rawItemText: pending.rawItemText,
    rawOptionTexts: Array.isArray(pending.rawOptionTexts) ? pending.rawOptionTexts : [],
    notes: Array.isArray(pending.notes) ? pending.notes.filter((entry): entry is string => typeof entry === "string") : [],
    resolvedOptions: Array.isArray(pending.resolvedOptions) ? pending.resolvedOptions : [],
    pendingOptionId: pending.pendingOptionId,
    pendingOptionName: pending.pendingOptionName ?? "",
    pendingOptionType: pending.pendingOptionType ?? "single",
    invalidValueTexts: Array.isArray(pending.invalidValueTexts) ? pending.invalidValueTexts.filter((entry): entry is string => typeof entry === "string") : undefined,
    ambiguousValueTexts: Array.isArray(pending.ambiguousValueTexts) ? pending.ambiguousValueTexts.filter((entry): entry is string => typeof entry === "string") : undefined,
    startedAt: pending.startedAt ?? new Date().toISOString(),
    queuedItems: Array.isArray(pending.queuedItems) ? pending.queuedItems : undefined,
  };
}

function mapConfigurationAnswerToRawOptionTexts(option: ProductOption, answerText: string): OrderLineItemOptionTextInput[] {
  const normalized = answerText.trim();
  if (!normalized) {
    return [];
  }

  if (option.type === "text") {
    return [{ groupText: option.name, valueText: normalized }];
  }

  const activeValues = option.values.filter((value) => value.isActive);
  return splitConfigurationAnswerTexts(normalized).map((entry) => {
    const numeric = Number(entry);
    const selectedByIndex =
      Number.isInteger(numeric) && numeric >= 1 && numeric <= activeValues.length
        ? activeValues[numeric - 1]?.name
        : undefined;

    return {
      groupText: option.name,
      valueText: selectedByIndex ?? entry,
    };
  });
}

function uniqueNotes(notes: string[]): string[] {
  return Array.from(new Set(notes.map((entry) => entry.trim()).filter(Boolean)));
}

async function handleClarification(
  input: RouteInboundMessageInput,
  responseText: string,
  manualReason: string,
): Promise<void> {
  if (input.conversation.clarificationAttempts >= 2) {
    await moveToManual(input, {
      type: "validation_failed_repeatedly",
      manualReason,
      title: "Conversacion necesita ayuda",
      description: "El bot no logro resolver la conversacion despues de varios intentos.",
      responseText: buildMaxClarificationMessage(),
    });
    return;
  }

  await incrementClarificationAttempts({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
  }).catch(() => undefined);

  await sendAndLogText(input, responseText);
}

async function moveToManual(input: RouteInboundMessageInput, payload: {
  type: HumanInterventionType;
  manualReason: string;
  title: string;
  description: string;
  responseText: string;
  orderId?: string;
  draftOrderId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await updateConversationState({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    state: "manual",
    manualReason: payload.manualReason,
  }).catch(() => undefined);

  await persistHumanInterventionAlert({
    env: input.env,
    schemaName: input.tenant.schemaName,
    alert: {
      conversationId: input.conversation.id,
      draftOrderId: payload.draftOrderId,
      orderId: payload.orderId,
      type: payload.type,
      title: payload.title,
      description: payload.description,
      metadata: {
        providerMessageId: input.message.providerMessageId,
        ...(payload.metadata ?? {}),
      },
    },
  }).catch((error: unknown) => {
    console.error("handoff.alert_create_failed", {
      error: error instanceof Error ? error.message : String(error),
      conversationId: input.conversation.id,
    });
  });

  await sendAndLogText(input, payload.responseText);
}

