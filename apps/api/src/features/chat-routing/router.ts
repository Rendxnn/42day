import { getOrCreateActiveDraftOrder } from "../draft-orders/service";
import { updateConversationState } from "../conversations/service";
import { buildMenuText, buildWelcomeMenuText } from "../menu/service";
import { detectSignals } from "../../modules/message-router/signal-detector";
import {
  buildClarificationPrompt,
  buildContinueWithMenuAndDraftPrompt,
  buildLocationCapturedForLaterMessage,
  buildManualHandoffMessage,
  buildRestaurantReviewPendingMessage,
  buildResumeExistingOrderPrompt,
} from "../../modules/message-router/response-composer";
import { isActiveOrderState, loadCurrentMenu, shouldTrySemanticAtState } from "./helpers";
import { sendAndLogText } from "./outbound";
import { tryHandleTransferFallbackPaymentMethod as tryHandleTransferFallbackPaymentMethodBranch } from "./transfer-fallback";
import { tryHandleTransferProof as tryHandleTransferProofBranch } from "./transfer-proof";
import { tryHandlePendingProductConfiguration as tryHandlePendingProductConfigurationBranch } from "./product-configuration";
import { tryHandleReplacementSelection as tryHandleReplacementSelectionBranch, handleReplacementSelectionClarification as handleReplacementSelectionClarificationBranch } from "./replacements";
import { tryHandleGuidedSelection } from "./guided-selection";
import { tryHandleSemanticOrder } from "./semantic-order";
import { handleClarification, moveToManual } from "./manual-handoff";
import { proceedToNextOrderStep, tryHandleFulfillmentSelection, tryHandleDeliveryAddress, tryHandlePaymentMethod, tryHandleConfirmation } from "./checkout";
import type { RouteInboundMessageInput } from "./types";
export type { RouteInboundMessageInput } from "./types";

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
    const handledTransferProof = await tryHandleTransferProofBranch(input);
    if (handledTransferProof) {
      return;
    }
  }

  if (input.conversation.state === "awaiting_transfer_fallback_payment_method") {
    const handledTransferFallback = await tryHandleTransferFallbackPaymentMethodBranch(input, signals);
    if (handledTransferFallback) {
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
    const handledReplacementSelection = await tryHandleReplacementSelectionBranch(input, signals);
    if (handledReplacementSelection) {
      return;
    }

    await handleReplacementSelectionClarificationBranch(input);
    return;
  }

  if (input.conversation.state === "awaiting_product_configuration") {
    const handledProductConfiguration = await tryHandlePendingProductConfigurationBranch(input);
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
