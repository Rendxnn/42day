import type { NormalizedInboundMessage } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { routeInboundMessage } from "../message-router/router";
import { resolveTenantForInboundMessage } from "../tenant-resolver/tenant-resolver";
import { normalizeWhatsAppPayload } from "./normalize";
import { logRawWhatsAppWebhook } from "./webhook-event-log";

export type HandleWhatsAppWebhookInput = {
  env: ApiBindings;
  payload: unknown;
};

export async function handleWhatsAppWebhook(input: HandleWhatsAppWebhookInput): Promise<void> {
  console.info("whatsapp.webhook.received", {
    receivedAt: new Date().toISOString(),
  });

  const rawLogStatus = await logRawWhatsAppWebhook(input.env, input.payload);

  if (rawLogStatus === "duplicate") {
    console.info("whatsapp.webhook.duplicate_ignored");
    return;
  }

  const messages = normalizeWhatsAppPayload(input.payload);

  if (messages.length === 0) {
    console.info("whatsapp.webhook.no_messages");
    return;
  }

  for (const message of messages) {
    await handleInboundMessage(input.env, message);
  }
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

  await routeInboundMessage({
    env,
    tenant,
    message,
  });
}
