import { createSupabaseRestClient, SupabaseRestError } from "../../lib/supabase-rest";
import type { ApiBindings } from "../../lib/bindings";

export type RawWebhookLogResult =
  | { status: "logged"; webhookEventId?: string }
  | { status: "duplicate" };

type WebhookEventRow = {
  id: string;
};

export async function logRawWhatsAppWebhook(env: ApiBindings, payload: unknown): Promise<RawWebhookLogResult> {
  const client = createSupabaseRestClient(env);
  const firstMessage = extractFirstMessage(payload);

  try {
    const rows = await client.insert<WebhookEventRow>({
      schema: "control",
      table: "webhook_events",
      rows: {
        provider: "whatsapp_cloud",
        event_id: firstMessage.eventId,
        provider_message_id: firstMessage.providerMessageId,
        phone_number_id: firstMessage.phoneNumberId,
        payload,
        status: "received",
      },
      returning: "representation",
    });
    return { status: "logged", webhookEventId: rows[0]?.id };
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 409) {
      return { status: "duplicate" };
    }

    throw error;
  }
}

export async function markRawWhatsAppWebhookProcessed(env: ApiBindings, webhookEventId: string | undefined): Promise<void> {
  if (!webhookEventId) {
    return;
  }

  const client = createSupabaseRestClient(env);

  await client.update({
    schema: "control",
    table: "webhook_events",
    values: {
      status: "processed",
      processed_at: new Date().toISOString(),
    },
    query: {
      id: `eq.${webhookEventId}`,
    },
  });
}

function extractFirstMessage(payload: unknown): {
  eventId?: string;
  providerMessageId?: string;
  phoneNumberId?: string;
} {
  const data = payload as {
    entry?: Array<{
      id?: string;
      changes?: Array<{
        value?: {
          metadata?: { phone_number_id?: string };
          messages?: Array<{ id?: string }>;
        };
      }>;
    }>;
  };

  const entry = data.entry?.[0];
  const change = entry?.changes?.[0];
  const message = change?.value?.messages?.[0];

  return {
    eventId: entry?.id,
    providerMessageId: message?.id,
    phoneNumberId: change?.value?.metadata?.phone_number_id,
  };
}
