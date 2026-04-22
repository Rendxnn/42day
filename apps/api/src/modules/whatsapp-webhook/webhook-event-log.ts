import { createSupabaseRestClient, SupabaseRestError } from "../../lib/supabase-rest";
import type { ApiBindings } from "../../lib/bindings";

export async function logRawWhatsAppWebhook(env: ApiBindings, payload: unknown): Promise<"logged" | "duplicate"> {
  const client = createSupabaseRestClient(env);
  const firstMessage = extractFirstMessage(payload);

  try {
    await client.insert({
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
    });
    return "logged";
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 409) {
      return "duplicate";
    }

    throw error;
  }
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
