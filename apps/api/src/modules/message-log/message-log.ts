import type { NormalizedInboundMessage, OutboundMessageResult } from "@42day/types";
import { createSupabaseRestClient } from "../../lib/supabase-rest";
import type { ApiBindings } from "../../lib/bindings";

export async function logInboundMessage(input: {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
  message: NormalizedInboundMessage;
}): Promise<void> {
  const client = createSupabaseRestClient(input.env);

  await client.insert({
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
}

export async function logOutboundTextMessage(input: {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
  text: string;
  result: OutboundMessageResult;
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
      payload: input.result.raw,
      status: input.result.providerMessageId ? "sent" : "send_attempted",
    },
  });
}
