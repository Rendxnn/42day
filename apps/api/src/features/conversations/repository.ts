import type { Conversation, ConversationContext, ConversationState } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { createSupabaseRestClient } from "../../lib/supabase-rest";

export type ConversationRow = {
  id: string;
  customer_id: string;
  channel: "whatsapp";
  state: Conversation["state"];
  context?: ConversationContext | null;
  clarification_attempts?: number | null;
  current_draft_order_id?: string | null;
  manual_reason?: string | null;
  last_inbound_at?: string | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
};

export async function selectRecentConversations(input: {
  env: ApiBindings;
  schemaName: string;
  customerId: string;
}): Promise<ConversationRow[]> {
  return createSupabaseRestClient(input.env).select<ConversationRow>({
    schema: input.schemaName,
    table: "conversations",
    query: {
      select: "*",
      customer_id: `eq.${input.customerId}`,
      channel: "eq.whatsapp",
      order: "updated_at.desc",
      limit: 5,
    },
  });
}

export async function selectConversationById(input: {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
}): Promise<ConversationRow | undefined> {
  const [row] = await createSupabaseRestClient(input.env).select<ConversationRow>({
    schema: input.schemaName,
    table: "conversations",
    query: {
      select: "*",
      id: `eq.${input.conversationId}`,
      limit: 1,
    },
  });

  return row;
}

export async function updateConversationRow(input: {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
  patch: Record<string, unknown>;
}): Promise<ConversationRow> {
  const [updated] = await createSupabaseRestClient(input.env).updateReturning<ConversationRow>({
    schema: input.schemaName,
    table: "conversations",
    query: {
      id: `eq.${input.conversationId}`,
    },
    patch: input.patch,
  });

  if (!updated) {
    throw new Error("conversation.row_missing");
  }

  return updated;
}

export async function insertConversationRow(input: {
  env: ApiBindings;
  schemaName: string;
  row: Record<string, unknown>;
}): Promise<ConversationRow> {
  const [created] = await createSupabaseRestClient(input.env).insert<ConversationRow>({
    schema: input.schemaName,
    table: "conversations",
    rows: input.row,
    returning: "representation",
  });

  if (!created) {
    throw new Error("conversation.row_missing");
  }

  return created;
}

export async function expireConversation(input: {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
  nowIso: string;
}): Promise<void> {
  await createSupabaseRestClient(input.env).update({
    schema: input.schemaName,
    table: "conversations",
    values: {
      state: "expired" satisfies ConversationState,
      updated_at: input.nowIso,
    },
    query: {
      id: `eq.${input.conversationId}`,
    },
  });
}
