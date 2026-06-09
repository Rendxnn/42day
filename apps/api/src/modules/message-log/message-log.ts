import type { NormalizedInboundMessage, OutboundMessageResult } from "@42day/types";
import { createSupabaseRestClient } from "../../lib/supabase-rest";
import type { ApiBindings } from "../../lib/bindings";

type MessageLogRow = {
  id: string;
};

export async function logInboundMessage(input: {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
  message: NormalizedInboundMessage;
}): Promise<{ id: string }> {
  const client = createSupabaseRestClient(input.env);

  const [logged] = await client.insertReturning<MessageLogRow>({
    schema: input.schemaName,
    table: "messages",
    rows: {
      conversation_id: input.conversationId,
      direction: "inbound",
      provider: input.message.provider,
      provider_message_id: input.message.providerMessageId,
      message_type: input.message.type,
      text: input.message.text,
      payload: input.message.raw,
      status: "logged",
    },
  });

  if (!logged) {
    throw new Error("message_log.inbound_insert_failed");
  }

  return logged;
}

export async function logOutboundTextMessage(input: {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
  text: string;
  result: OutboundMessageResult;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const client = createSupabaseRestClient(input.env);

  await client.insert({
    schema: input.schemaName,
    table: "messages",
    rows: {
      conversation_id: input.conversationId,
      direction: "outbound",
      provider: "whatsapp_cloud",
      provider_message_id: input.result.providerMessageId,
      message_type: "text",
      text: input.text,
      payload: appendInternalPayload(input.result.raw, input.metadata),
      status: input.result.providerMessageId ? "sent" : "send_attempted",
    },
  });
}

function appendInternalPayload(raw: unknown, metadata: Record<string, unknown> | undefined): unknown {
  if (!metadata) {
    return raw;
  }

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return {
      ...raw,
      internal: metadata,
    };
  }

  return {
    raw,
    internal: metadata,
  };
}
