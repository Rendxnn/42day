import type { NormalizedInboundMessage } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { loadOrCreateActiveConversation } from "../conversation-service/conversation-service";
import { saveCustomerAddressFromWhatsAppLocation } from "../customer-address-service/customer-address-service";
import { findOrCreateCustomer } from "../customer-service/customer-service";
import { logInboundMessage, logOutboundTextMessage } from "../message-log/message-log";
import { routeInboundMessage } from "../message-router/router";
import { resolveTenantForInboundMessage } from "../tenant-resolver/tenant-resolver";
import { normalizeWhatsAppPayload } from "./normalize";
import { logRawWhatsAppWebhook, markRawWhatsAppWebhookProcessed } from "./webhook-event-log";
import { transcribeWhatsAppAudio } from "../audio-transcription/audio-transcription";
import { sendWhatsAppTextMessage } from "./whatsapp-client";

export type HandleWhatsAppWebhookInput = {
  env: ApiBindings;
  payload: unknown;
};

export async function handleWhatsAppWebhook(input: HandleWhatsAppWebhookInput): Promise<void> {
  console.info("whatsapp.webhook.received", {
    receivedAt: new Date().toISOString(),
  });

  const rawLogStatus = await logRawWhatsAppWebhook(input.env, input.payload);

  if (rawLogStatus.status === "duplicate") {
    console.info("whatsapp.webhook.duplicate_ignored");
    return;
  }

  const messages = normalizeWhatsAppPayload(input.payload);

  if (messages.length === 0) {
    console.info("whatsapp.webhook.no_messages");
    await markRawWhatsAppWebhookProcessed(input.env, rawLogStatus.webhookEventId);
    return;
  }

  for (const message of messages) {
    await handleInboundMessage(input.env, message);
  }

  await markRawWhatsAppWebhookProcessed(input.env, rawLogStatus.webhookEventId);
}

async function handleInboundMessage(env: ApiBindings, message: NormalizedInboundMessage): Promise<void> {
  console.info("whatsapp.message.normalized", {
    providerMessageId: message.providerMessageId,
    phoneNumberId: message.phoneNumberId,
    type: message.type,
  });

  const tenant = await resolveTenantForInboundMessage(env, message);

  if (!tenant) {
    console.warn("tenant.not_found", {
      phoneNumberId: message.phoneNumberId,
      providerMessageId: message.providerMessageId,
    });
    return;
  }

  const customer = await findOrCreateCustomer({
    env,
    schemaName: tenant.schemaName,
    phone: message.from,
  });

  const conversation = await loadOrCreateActiveConversation({
    env,
    schemaName: tenant.schemaName,
    customerId: customer.id,
  });

  let routedMessage = message;
  if (message.type === "audio") {
    if (!message.mediaId) {
      await logInboundMessage({
        env,
        schemaName: tenant.schemaName,
        conversationId: conversation.id,
        message,
      }).catch(() => undefined);
      await sendAudioTranscriptionFailure(env, tenant.schemaName, conversation.id, message.from, "No recibí el archivo de audio completo. Por favor envíame el audio otra vez o escríbeme tu mensaje.");
      return;
    }

    try {
      const transcription = await transcribeWhatsAppAudio({
        env,
        mediaId: message.mediaId,
        mimeType: message.mediaMimeType,
      });
      routedMessage = {
        ...message,
        text: transcription,
        raw: {
          original: message.raw,
          transcription: {
            provider: env.AUDIO_TRANSCRIPTION_PROVIDER?.trim() || (env.OPENAI_API_KEY?.trim() ? "openai" : "huggingface"),
            model: env.AUDIO_TRANSCRIPTION_PROVIDER === "huggingface"
              ? env.HUGGINGFACE_TRANSCRIPTION_MODEL?.trim() || "openai/whisper-large-v3-turbo"
              : env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "whisper-1",
            text: transcription,
          },
        },
      };
    } catch (error) {
      console.warn("whatsapp.audio_transcription_failed", {
        providerMessageId: message.providerMessageId,
        reason: error instanceof Error ? error.message : String(error),
      });
      await logInboundMessage({
        env,
        schemaName: tenant.schemaName,
        conversationId: conversation.id,
        message,
      }).catch(() => undefined);
      await sendAudioTranscriptionFailure(env, tenant.schemaName, conversation.id, message.from, "No pude entender el audio en este momento. Por favor repítelo o escríbeme lo que necesitas.");
      return;
    }
  }

  const loggedMessage = await logInboundMessage({
    env,
    schemaName: tenant.schemaName,
    conversationId: conversation.id,
    message: routedMessage,
  });

  await saveCustomerAddressFromWhatsAppLocation({
    env,
    schemaName: tenant.schemaName,
    customerId: customer.id,
    message: routedMessage,
  });

  await routeInboundMessage({
    env,
    tenant,
    conversation,
    message: routedMessage,
    loggedMessageId: loggedMessage.id,
  });
}

async function sendAudioTranscriptionFailure(
  env: ApiBindings,
  schemaName: string,
  conversationId: string,
  customerPhone: string,
  text: string,
): Promise<void> {
  const result = await sendWhatsAppTextMessage(env, { to: customerPhone, text });
  await logOutboundTextMessage({
    env,
    schemaName,
    conversationId,
    text,
    result,
    metadata: { audioTranscription: "failed" },
  }).catch(() => undefined);
}
