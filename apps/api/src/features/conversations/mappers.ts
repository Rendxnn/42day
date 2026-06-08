import type { Conversation } from "@42day/types";
import type { ConversationRow } from "./repository";

export function mapConversationRow(row: ConversationRow | undefined): Conversation {
  if (!row) {
    throw new Error("conversation.row_missing");
  }

  return {
    id: row.id,
    customerId: row.customer_id,
    channel: row.channel,
    state: row.state,
    context: row.context ?? {},
    clarificationAttempts: row.clarification_attempts ?? 0,
    currentDraftOrderId: row.current_draft_order_id ?? undefined,
    manualReason: row.manual_reason ?? undefined,
    lastInboundAt: row.last_inbound_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
