import type { NormalizedInboundMessage } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { loadOrCreateActiveConversation } from "../conversation-service/conversation-service";
import { saveCustomerAddressFromWhatsAppLocation } from "../customer-address-service/customer-address-service";
import { findOrCreateCustomer } from "../customer-service/customer-service";
import { logInboundMessage } from "../message-log/message-log";
import { routeInboundMessage } from "../message-router/router";
import { resolveTenantForInboundMessage } from "../tenant-resolver/tenant-resolver";
import { normalizeWhatsAppPayload } from "./normalize";
import { logRawWhatsAppWebhook, markRawWhatsAppWebhookProcessed } from "./webhook-event-log";

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

  const loggedMessage = await logInboundMessage({
    env,
    schemaName: tenant.schemaName,
    conversationId: conversation.id,
    message,
  });

  await saveCustomerAddressFromWhatsAppLocation({
    env,
    schemaName: tenant.schemaName,
    customerId: customer.id,
    message,
  });

  await routeInboundMessage({
    env,
    tenant,
    conversation,
    message,
    loggedMessageId: loggedMessage.id,
  });
}
