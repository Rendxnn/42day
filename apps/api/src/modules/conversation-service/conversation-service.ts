import { getConversationExpiration, isConversationExpired } from "@42day/core";
import type { Conversation } from "@42day/types";

export function createNewConversation(input: {
  id: string;
  customerId: string;
  now?: Date;
}): Conversation {
  const now = input.now ?? new Date();

  return {
    id: input.id,
    customerId: input.customerId,
    channel: "whatsapp",
    state: "awaiting_mode_selection",
    expiresAt: getConversationExpiration(now).toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function conversationNeedsExpiration(conversation: Conversation, now = new Date()): boolean {
  return isConversationExpired(conversation.expiresAt, now);
}
