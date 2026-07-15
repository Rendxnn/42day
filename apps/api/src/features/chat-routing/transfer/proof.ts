import { createSupabaseRestClient } from "../../../lib/supabase-rest";
import {
  buildManualHandoffMessage,
  buildTransferProofAttachmentPrompt,
  buildTransferProofProcessingFailedMessage,
  buildTransferProofReceivedMessage,
  buildTransferProofUnsupportedFormatPrompt,
} from "../../../modules/message-router/response-composer";
import { storeInboundPaymentProof } from "../../payment-proofs/service";
import {
  isTransferProofMediaMessage,
  isTransferProofUnsupportedMessage,
  looksLikeTransferProofNotice,
} from "../../payment-proofs/helpers";
import { moveToManual } from "../manual/handoff";
import { sendAndLogText } from "../outbound/send";
import type { RouteInboundMessageInput } from "../shared/types";

export async function tryHandleTransferProof(input: RouteInboundMessageInput): Promise<boolean> {
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

export async function handleTransferProofClarification(input: RouteInboundMessageInput): Promise<void> {
  await sendAndLogText(input, buildTransferProofAttachmentPrompt());
}
