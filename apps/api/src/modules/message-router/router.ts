import type { Conversation, DraftOrder, HumanInterventionType, MenuItem, NormalizedInboundMessage, PaymentMethod, Tenant, TodayMenuPayload } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import {
  addMenuItemToDraftOrder,
  getOrCreateActiveDraftOrder,
  removeItemsFromDraftOrder,
  setDraftOrderItemQuantity,
  updateDraftOrderDeliveryAddress,
  updateDraftOrderFulfillment,
  updateDraftOrderPaymentMethod,
} from "../draft-order-service/draft-order-service";
import { getLatestCustomerAddress, saveCustomerAddressFromText } from "../customer-address-service/customer-address-service";
import {
  incrementClarificationAttempts,
  updateConversationState,
} from "../conversation-service/conversation-service";
import {
  buildMenuText,
  buildWelcomeMenuText,
  loadTodayPublishedMenu,
  resolveMenuSelection,
  resolveMenuSelectionFromText,
  resolveMenuSelectionsFromText,
} from "../menu-service/menu-service";
import { logOutboundTextMessage } from "../message-log/message-log";
import {
  applyCustomerReplacementSelection,
  cancelPendingCustomerReplacementOrder,
  getPendingCustomerReplacementOrder,
  persistConfirmedOrder,
} from "../order-service/order-service";
import { parseFreeFormOrder, type SemanticOrderEditAction, type SemanticParserResult } from "../semantic-parser/semantic-parser";
import { sendWhatsAppTextMessage } from "../whatsapp-webhook/whatsapp-client";
import { persistHumanInterventionAlert } from "../handoff-service/handoff-service";
import { detectSignals, parseFulfillmentSelection, parsePaymentMethod, type DetectedSignals } from "./signal-detector";
import {
  buildAddMorePrompt,
  buildClarificationPrompt,
  buildCurrentDraftText,
  buildDeliveryAddressPrompt,
  buildFulfillmentPrompt,
  buildManualHandoffMessage,
  buildMaxClarificationMessage,
  buildOrderAdjustedPrompt,
  buildOrderSummaryText,
  buildPaymentPrompt,
} from "./response-composer";

export type RouteInboundMessageInput = {
  env: ApiBindings;
  tenant: Tenant;
  conversation: Conversation;
  message: NormalizedInboundMessage;
  routingTrace?: ResponseRoutingTrace;
};

type ResponseRoutingTrace = {
  responseSource?: "deterministic" | "llm" | "deterministic_after_llm_fallback";
  responseReason?: string;
  llm?: {
    attempted: boolean;
    used: boolean;
    outcome: "handled" | "skipped_or_failed" | "low_confidence" | "unresolved" | "not_order";
    provider?: "gemini";
    reason?: string;
    intent?: SemanticParserResult["intent"];
    confidence?: number;
    itemCount?: number;
    editActionCount?: number;
  };
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

  if (input.conversation.state === "awaiting_transfer_proof" && signals.hasTransferProofCandidate) {
    await moveToManual(input, {
      type: "transfer_payment_review",
      manualReason: "transfer_payment_review",
      title: "Comprobante pendiente por revisar",
      description: "El cliente envio un comprobante o aviso de pago por transferencia.",
      responseText: "Recibi el comprobante. Ya se lo dejo al restaurante para que lo revise.",
    });
    return;
  }

  if (input.conversation.state === "awaiting_restaurant_confirmation") {
    await sendAndLogText(
      input,
      "Tu pedido sigue en revision por el restaurante. Apenas lo confirmen te avisamos por aqui.",
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
      "Recibi tu ubicacion. La uso como direccion de entrega cuando sigamos con el pedido.",
    );
    return;
  }

  await handleClarification(input, buildClarificationPrompt(input.conversation.state), "validation_failed_repeatedly");
}

function shouldTrySemanticAtState(state: Conversation["state"], signals: DetectedSignals): boolean {
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

        await sendAndLogText(input, [buildMenuText(menu), "", buildCurrentDraftText(draft), "Puedes pedirme otro producto por nombre o numero."].join("\n"));
        return;
      }

      await sendAndLogText(input, ["Aqui seguimos con tu pedido.", buildCurrentDraftText(draft), buildClarificationPrompt(input.conversation.state)].join("\n\n"));
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
      updatedDraft = await addSelectedItem(input, {
        menu,
        selectedItem: selection.item,
        quantity: selection.quantity,
      });
      lastSelectedItem = selection.item;
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

  const updatedDraft = await addSelectedItem(input, {
    menu,
    selectedItem,
    quantity,
  });

  await continueAfterItemAdded(input, {
    menu,
    draft: updatedDraft,
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

  for (const item of parsed.items) {
    const resolved = resolveMenuSelectionFromText(menu, item.productText);
    const selectedItem = resolved?.item ?? null;
    if (!selectedItem) {
      continue;
    }

    lastSelectedItem = selectedItem;
    resolvedCount += 1;
    updatedDraft = await addSelectedItem(input, {
      menu,
      selectedItem,
      quantity: Math.max(1, Math.round(item.quantity ?? resolved?.quantity ?? 1)),
      options: buildSemanticOptions(item),
      notes: item.notes?.join("; "),
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

    updatedDraft = await addSelectedItem(input, {
      menu: payload.menu,
      selectedItem,
      quantity: Math.max(1, Math.round(action.quantity ?? resolved?.quantity ?? 1)),
      options: buildSemanticOptions(action),
      notes: action.notes?.join("; "),
    });
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

    await sendAndLogText(input, ["Listo, lo ajuste.", "", buildOrderSummaryText(payload.draft, payload.draft.paymentMethod)].join("\n"));
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

async function addSelectedItem(input: RouteInboundMessageInput, payload: {
  menu: TodayMenuPayload;
  selectedItem: MenuItem;
  quantity: number;
  options?: Record<string, unknown>;
  notes?: string;
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

    await sendAndLogText(input, "Todavia no tengo productos en el pedido. Que quieres pedir?");
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

  await sendAndLogText(input, ["Perfecto, queda para recoger.", buildPaymentPrompt(updatedDraft, menu)].join("\n\n"));
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
      "No pude guardar bien la direccion. Enviamela otra vez o comparte tu ubicacion de WhatsApp.",
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
      [`Listo, uso esta direccion: ${address.addressText}.`, "", buildOrderSummaryText(draftWithPayment, paymentMethod)].join("\n"),
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
    [`Listo, uso esta direccion: ${address.addressText}.`, "", buildPaymentPrompt(updatedDraft, menu)].join("\n"),
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
      "Dale, lo ajustamos. Dime que cambiamos: puedes pedirme que agregue, quite o cambie productos.",
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
    [
      `Listo, deje tu pedido ${order.id.slice(0, 8)} pendiente de revision.`,
      draft.paymentMethod === "transfer"
        ? "El restaurante revisa disponibilidad primero y, si todo esta bien, te compartimos los datos para la transferencia por aqui."
        : "El restaurante lo revisa y te confirma por aqui en un momento.",
    ].join("\n"),
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
      responseText: "No pude ubicar el pedido que estaba pendiente por ajustar. Te comunico con alguien del restaurante.",
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

    await sendAndLogText(input, "Listo, cancelamos el pedido. Gracias por avisarnos.");
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
      `Listo, cambiamos ${result.unavailableItemName} por ${result.selectedReplacement.name}. El restaurante confirma el ajuste en un momento.`,
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
        ? "La opcion que elegiste ya no esta disponible. Te comunico con alguien del restaurante para resolverlo."
        : "No pude actualizar el pedido con ese reemplazo. Te comunico con alguien del restaurante.",
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
      responseText: "No pude ubicar el pedido que estaba pendiente por ajustar. Te comunico con alguien del restaurante.",
    });
    return;
  }

  if (input.conversation.clarificationAttempts >= 2) {
    await moveToManual(input, {
      type: "order_change_requested",
      manualReason: "replacement_selection_unresolved",
      title: "Cliente no eligio reemplazo claro",
      description: "El cliente no eligio un reemplazo interpretable despues de varios intentos.",
      responseText: "No logre identificar el reemplazo que prefieres. Te comunico con alguien del restaurante para resolverlo.",
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
      type: payload.type,
      title: payload.title,
      description: payload.description,
      metadata: {
        providerMessageId: input.message.providerMessageId,
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

async function loadCurrentMenu(input: RouteInboundMessageInput): Promise<TodayMenuPayload> {
  return loadTodayPublishedMenu({
    env: input.env,
    schemaName: input.tenant.schemaName,
    tenantSlug: input.tenant.slug,
    timezone: input.tenant.timezone,
  });
}

async function sendAndLogText(input: RouteInboundMessageInput, text: string): Promise<void> {
  const metadata = buildOutboundRoutingMetadata(input);
  const result = await sendWhatsAppTextMessage(input.env, {
    to: input.message.from,
    text,
  });

  await logOutboundTextMessage({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    text,
    result,
    metadata,
  }).catch((error: unknown) => {
    console.error("message_log.outbound_failed", {
      error: error instanceof Error ? error.message : String(error),
      conversationId: input.conversation.id,
    });
  });
}

function markLlmAttempt(input: RouteInboundMessageInput): void {
  input.routingTrace = {
    ...(input.routingTrace ?? {}),
    llm: {
      attempted: true,
      used: false,
      outcome: "skipped_or_failed",
      provider: "gemini",
    },
  };
}

function markLlmOutcome(input: RouteInboundMessageInput, payload: {
  used: boolean;
  outcome: NonNullable<ResponseRoutingTrace["llm"]>["outcome"];
  reason?: string;
  parsed?: SemanticParserResult;
}): void {
  input.routingTrace = {
    ...(input.routingTrace ?? {}),
    responseSource: payload.used ? "llm" : "deterministic_after_llm_fallback",
    responseReason: payload.reason,
    llm: {
      attempted: true,
      used: payload.used,
      outcome: payload.outcome,
      provider: "gemini",
      reason: payload.reason,
      intent: payload.parsed?.intent,
      confidence: payload.parsed?.confidence,
      itemCount: payload.parsed?.items.length,
      editActionCount: payload.parsed?.editActions?.length,
    },
  };
}

function buildOutboundRoutingMetadata(input: RouteInboundMessageInput): Record<string, unknown> {
  const trace = input.routingTrace ?? {
    responseSource: "deterministic",
    responseReason: "default",
  };
  const responseSource =
    trace.responseSource ??
    (trace.llm?.attempted && !trace.llm.used ? "deterministic_after_llm_fallback" : "deterministic");

  return {
    routing: {
      responseSource,
      responseReason: trace.responseReason ?? null,
      decidedAt: new Date().toISOString(),
      conversationState: input.conversation.state,
      inboundProviderMessageId: input.message.providerMessageId ?? null,
      llm: trace.llm ?? {
        attempted: false,
        used: false,
      },
    },
  };
}

function buildGuidedContext(menu: TodayMenuPayload, selectedItem: MenuItem): Record<string, unknown> {
  return {
    flow: "guided",
    activeMenuId: menu.menu?.id,
    activeLocationId: menu.location?.id,
    lastSelectedMenuItemId: selectedItem.id,
  };
}

function resolveReplacementOptionSelection(input: {
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

function buildReplacementSelectionPrompt(replacementOptions: Array<{
  name: string;
  price?: number;
}>): string {
  const lines = replacementOptions
    .slice(0, 3)
    .map((option, index) => `${index + 1}. ${option.name}${option.price !== undefined ? ` - ${formatCop(option.price)}` : ""}`);

  return [
    "No te entendi bien.",
    'Responde con el numero de la opcion que prefieras o escribe "cancelar":',
    lines.join("\n"),
  ].join("\n\n");
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

function formatCop(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function mergeSemanticSignals(signals: DetectedSignals, parsed: SemanticParserResult): DetectedSignals {
  const fulfillmentText = parsed.fulfillmentText ?? undefined;
  const paymentText = parsed.paymentText ?? undefined;

  return {
    ...signals,
    fulfillmentType: signals.fulfillmentType ?? (fulfillmentText ? parseFulfillmentSelection(fulfillmentText, "awaiting_guided_item_selection") : null),
    paymentMethod: signals.paymentMethod ?? (paymentText ? parsePaymentMethod(paymentText, "awaiting_guided_item_selection") : null),
  };
}

function buildSemanticOptions(item: Pick<SemanticParserResult["items"][number], "optionTexts" | "notes">): Record<string, unknown> | undefined {
  const options: Record<string, unknown> = {};

  if (item.optionTexts && item.optionTexts.length > 0) {
    options.optionTexts = item.optionTexts;
  }

  if (item.notes && item.notes.length > 0) {
    options.notes = item.notes;
  }

  return Object.keys(options).length > 0 ? options : undefined;
}

function draftReadyForSummary(draft: DraftOrder): draft is DraftOrder & { paymentMethod: PaymentMethod } {
  return Boolean(
    draft.paymentMethod &&
    draft.fulfillmentType &&
    (draft.fulfillmentType === "pickup" || draft.deliveryAddress || draft.deliveryAddressId),
  );
}

function isActiveOrderState(state: Conversation["state"]): boolean {
  return [
    "awaiting_guided_item_selection",
    "awaiting_more_items",
    "awaiting_fulfillment_type",
    "awaiting_address",
    "awaiting_payment_method",
    "awaiting_confirmation",
    "awaiting_transfer_proof",
  ].includes(state);
}
