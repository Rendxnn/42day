import { normalizeText } from "../../modules/message-router/message-normalizer";
import { detectSignals } from "../../modules/message-router/signal-detector";
import { classifyDeliveryAddressText } from "../delivery-coverage/address-text";
import {
  buildClarificationPrompt,
  buildLocationCapturedForLaterMessage,
  buildRestaurantReviewPendingMessage,
} from "../../modules/message-router/response-composer";
import { sendAndLogText } from "./outbound/send";
import {
  handleTransferFallbackPaymentMethodClarification,
} from "./transfer/fallback";
import { handleTransferProofClarification, tryHandleTransferProof as tryHandleTransferProofBranch } from "./transfer/proof";
import { tryHandleSemanticOrder } from "./semantic/order";
import { handleClarification } from "./manual/handoff";
import { moveToManual } from "./manual/handoff";
import { resolveEntryFlowAction } from "./entry-flow";
import { handleCustomerOrderStatus } from "./order-status";
import { buildWelcomeMenuText } from "../menu/service";
import { loadCurrentMenu } from "./shared/helpers";
import { logRoutingDiagnostic } from "./shared/tracing";
import {
  tryHandleDeliveryAddress,
} from "./checkout";
import type { RouteInboundMessageInput } from "./shared/types";
export type { RouteInboundMessageInput } from "./shared/types";

export async function routeInboundMessage(input: RouteInboundMessageInput): Promise<void> {
  input.routingTrace = {
    responseSource: "deterministic",
    responseReason: "route_started",
  };

  logRoutingDiagnostic(input, "chat_routing.message_received", {
    hasText: Boolean(input.message.text?.trim()),
    textLength: input.message.text?.trim().length ?? 0,
  });

  if (!input.tenant.automationEnabled) {
    console.info("tenant.automation_disabled", {
      tenantId: input.tenant.id,
      providerMessageId: input.message.providerMessageId,
    });
    return;
  }

  const normalizedText = normalizeText(input.message.text);

  logRoutingDiagnostic(input, "chat_routing.inbound_received", {
    normalizedTextLength: normalizedText.length,
  });

  if (!input.conversation.automationEnabled || input.conversation.state === "manual") {
    console.info("conversation.manual_auto_reply_skipped", {
      tenantId: input.tenant.id,
      conversationId: input.conversation.id,
      providerMessageId: input.message.providerMessageId,
    });
    return;
  }

  const signals = detectSignals({
    message: input.message,
    state: input.conversation.state,
  });

  // Only explicit, non-mutating controls bypass semantic interpretation.
  // A first natural-language order must always reach the semantic planner.
  const entryAction = resolveEntryFlowAction(signals);
  if (entryAction === "handoff") {
    await moveToManual(input, {
      type: "support_requested",
      manualReason: "explicit_human_request",
      title: "Cliente solicita atención humana",
      description: "El cliente pidió hablar con una persona.",
      responseText: "Claro, voy a ponerte en contacto con alguien del restaurante para que te ayude.",
    });
    return;
  }

  if (signals.wantsOrderStatus) {
    await handleCustomerOrderStatus(input);
    return;
  }

  if (entryAction === "show_menu") {
    const menu = await loadCurrentMenu(input);
    await sendAndLogText(input, buildWelcomeMenuText(menu, input.tenant.name));
    return;
  }

  if (input.conversation.state === "awaiting_transfer_proof") {
    const handledTransferProof = await tryHandleTransferProofBranch(input);
    if (handledTransferProof) {
      return;
    }
  }

  if (await trySemanticFallback(input)) {
    return;
  }

  if (
    input.conversation.state === "awaiting_address" ||
    (input.conversation.state === "awaiting_confirmation" && input.message.type === "location")
  ) {
    const addressKind = classifyDeliveryAddressText(normalizedText);
    const handledAddress = await tryHandleDeliveryAddress(input, {
      looksLikeAddress: input.message.type === "location" || addressKind === "structured_address",
      cannotShareLocation: addressKind === "location_limitation",
      normalizedText,
    });
    if (handledAddress) {
      return;
    }
  }

  if (input.message.type === "location" && input.message.location) {
    await sendAndLogText(
      input,
      buildLocationCapturedForLaterMessage(),
    );
    return;
  }

  if (input.conversation.state === "awaiting_restaurant_confirmation") {
    await sendAndLogText(input, buildRestaurantReviewPendingMessage());
    return;
  }

  if (input.conversation.state === "awaiting_transfer_proof") {
    await handleTransferProofClarification(input);
    return;
  }

  if (input.conversation.state === "awaiting_transfer_fallback_payment_method") {
    await handleTransferFallbackPaymentMethodClarification(input);
    return;
  }

  await handleClarification(input, buildClarificationPrompt(input.conversation.state), "validation_failed_repeatedly");
}

async function trySemanticFallback(input: RouteInboundMessageInput): Promise<boolean> {
  if (!input.message.text?.trim()) {
    return false;
  }

  return tryHandleSemanticOrder(input);
}
