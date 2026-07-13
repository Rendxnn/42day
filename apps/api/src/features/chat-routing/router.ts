import { normalizeText } from "../../modules/message-router/message-normalizer";
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

  if (input.conversation.state === "manual") {
    console.info("conversation.manual_auto_reply_skipped", {
      tenantId: input.tenant.id,
      conversationId: input.conversation.id,
      providerMessageId: input.message.providerMessageId,
    });
    return;
  }

  if (input.conversation.state === "awaiting_transfer_proof") {
    const handledTransferProof = await tryHandleTransferProofBranch(input);
    if (handledTransferProof) {
      return;
    }
  }

  if (
    input.conversation.state === "awaiting_address" ||
    (input.conversation.state === "awaiting_confirmation" && input.message.type === "location")
  ) {
    const handledAddress = await tryHandleDeliveryAddress(input, {
      looksLikeAddress: true,
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

  if (await trySemanticFallback(input)) {
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
