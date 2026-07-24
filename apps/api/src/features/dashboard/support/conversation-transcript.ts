import type { ConversationTranscriptMessage } from "@42day/types";

export type ConversationMessageRow = {
  id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  text?: string | null;
  status: string;
  created_at: string;
};

const DEFAULT_TRANSCRIPT_LIMIT = 300;
const MAX_TRANSCRIPT_LIMIT = 500;

export function parseTranscriptLimit(rawValue?: string): number {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_TRANSCRIPT_LIMIT;
  }

  return Math.min(parsed, MAX_TRANSCRIPT_LIMIT);
}

export function mapConversationTranscriptMessage(row: ConversationMessageRow): ConversationTranscriptMessage {
  return {
    id: row.id,
    direction: row.direction,
    messageType: row.message_type,
    text: row.text ?? undefined,
    status: row.status,
    createdAt: row.created_at,
  };
}
