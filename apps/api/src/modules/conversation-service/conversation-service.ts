import { getConversationExpiration, isConversationExpired } from "@42day/core";
import type { Conversation } from "@42day/types";
import { createSupabaseRestClient } from "../../lib/supabase-rest";
import type { ApiBindings } from "../../lib/bindings";

type ConversationRow = {
  id: string;
  customer_id: string;
  channel: "whatsapp";
  state: Conversation["state"];
  current_draft_order_id?: string | null;
  manual_reason?: string | null;
  last_inbound_at?: string | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
};

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

export async function loadOrCreateActiveConversation(input: {
  env: ApiBindings;
  schemaName: string;
  customerId: string;
  now?: Date;
}): Promise<Conversation> {
  const client = createSupabaseRestClient(input.env);
  const now = input.now ?? new Date();
  const rows = await client.select<ConversationRow>({
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

  const reusable = rows
    .map(mapConversationRow)
    .find((conversation) => !conversationNeedsExpiration(conversation, now) && !["manual", "completed", "expired"].includes(conversation.state));

  if (reusable) {
    const expiresAt = getConversationExpiration(now).toISOString();

    await client.update({
      schema: input.schemaName,
      table: "conversations",
      values: {
        last_inbound_at: now.toISOString(),
        expires_at: expiresAt,
        updated_at: now.toISOString(),
      },
      query: {
        id: `eq.${reusable.id}`,
      },
    });

    return {
      ...reusable,
      lastInboundAt: now.toISOString(),
      expiresAt,
      updatedAt: now.toISOString(),
    };
  }

  for (const row of rows) {
    const conversation = mapConversationRow(row);
    if (conversationNeedsExpiration(conversation, now) && conversation.state !== "expired") {
      await client.update({
        schema: input.schemaName,
        table: "conversations",
        values: {
          state: "expired",
          updated_at: now.toISOString(),
        },
        query: {
          id: `eq.${conversation.id}`,
        },
      });
    }
  }

  const expiresAt = getConversationExpiration(now).toISOString();
  const created = await client.insert<ConversationRow>({
    schema: input.schemaName,
    table: "conversations",
    rows: {
      customer_id: input.customerId,
      channel: "whatsapp",
      state: "awaiting_mode_selection",
      last_inbound_at: now.toISOString(),
      expires_at: expiresAt,
    },
    returning: "representation",
  });

  return mapConversationRow(created[0]);
}

function mapConversationRow(row: ConversationRow | undefined): Conversation {
  if (!row) {
    throw new Error("conversation.row_missing");
  }

  return {
    id: row.id,
    customerId: row.customer_id,
    channel: row.channel,
    state: row.state,
    currentDraftOrderId: row.current_draft_order_id ?? undefined,
    manualReason: row.manual_reason ?? undefined,
    lastInboundAt: row.last_inbound_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
