import { logOutboundTextMessage } from "../../modules/message-log/message-log";
import { sendWhatsAppTextMessage } from "../../modules/whatsapp-webhook/whatsapp-client";
import { buildOutboundRoutingMetadata } from "./tracing";
import type { RouteInboundMessageInput } from "./types";

export async function sendAndLogText(input: RouteInboundMessageInput, text: string): Promise<void> {
  const metadata = buildOutboundRoutingMetadata(input);
  const result = await sendWhatsAppTextMessage(input.env, {
    to: input.message.from,
    text,
  });

  await logOutboundTextMessage({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    text,
    result,
    metadata,
  }).catch((error: unknown) => {
    console.error("message_log.outbound_failed", {
      error: error instanceof Error ? error.message : String(error),
      conversationId: input.conversation.id,
    });
  });
}
