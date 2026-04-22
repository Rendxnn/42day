import type { ConversationState } from "@42day/types";

export const CONVERSATION_TIMEOUT_MINUTES = 30;

export function getConversationExpiration(now = new Date()): Date {
  return new Date(now.getTime() + CONVERSATION_TIMEOUT_MINUTES * 60 * 1000);
}

export function isConversationExpired(expiresAt: string | Date | undefined, now = new Date()): boolean {
  if (!expiresAt) {
    return false;
  }

  return new Date(expiresAt).getTime() <= now.getTime();
}

export function shouldStopAutoReply(state: ConversationState): boolean {
  return state === "manual" || state === "completed" || state === "expired";
}
