import { getConversationExpiration, isConversationExpired } from "@42day/core";
import type { Conversation, ConversationContext, ConversationState } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { mapConversationRow } from "./mappers";
import {
  expireConversation,
  insertConversationRow,
  selectConversationById,
  selectRecentConversations,
  updateConversationRow,
} from "./repository";

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
    context: {},
    clarificationAttempts: 0,
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
  const now = input.now ?? new Date();
  const rows = await selectRecentConversations({
    env: input.env,
    schemaName: input.schemaName,
    customerId: input.customerId,
  });

  const reusable = rows
    .map(mapConversationRow)
    .find((conversation) => !conversationNeedsExpiration(conversation, now) && !["completed", "expired"].includes(conversation.state));

  if (reusable) {
    const expiresAt = getConversationExpiration(now).toISOString();

    await updateConversationRow({
      env: input.env,
      schemaName: input.schemaName,
      conversationId: reusable.id,
      patch: {
        last_inbound_at: now.toISOString(),
        expires_at: expiresAt,
        updated_at: now.toISOString(),
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
      await expireConversation({
        env: input.env,
        schemaName: input.schemaName,
        conversationId: conversation.id,
        nowIso: now.toISOString(),
      });
    }
  }

  const expiresAt = getConversationExpiration(now).toISOString();
  const created = await insertConversationRow({
    env: input.env,
    schemaName: input.schemaName,
    row: {
      customer_id: input.customerId,
      channel: "whatsapp",
      state: "awaiting_mode_selection",
      context: {},
      clarification_attempts: 0,
      last_inbound_at: now.toISOString(),
      expires_at: expiresAt,
    },
  });

  return mapConversationRow(created);
}

export async function updateConversationState(input: {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
  state: ConversationState;
  manualReason?: string | null;
  context?: ConversationContext;
  resetClarificationAttempts?: boolean;
}): Promise<Conversation> {
  const now = new Date().toISOString();
  return mapConversationRow(
    await updateConversationRow({
      env: input.env,
      schemaName: input.schemaName,
      conversationId: input.conversationId,
      patch: {
      state: input.state,
      ...(input.manualReason !== undefined ? { manual_reason: input.manualReason } : {}),
      ...(input.context !== undefined ? { context: input.context } : {}),
      ...(input.resetClarificationAttempts ? { clarification_attempts: 0 } : {}),
      updated_at: now,
      },
    }),
  );
}

export async function updateConversationContext(input: {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
  context: ConversationContext;
}): Promise<Conversation> {
  const current = await selectConversationById({
    env: input.env,
    schemaName: input.schemaName,
    conversationId: input.conversationId,
  });

  if (!current) {
    throw new Error("conversation.not_found");
  }

  return updateConversationState({
    env: input.env,
    schemaName: input.schemaName,
    conversationId: input.conversationId,
    state: current.state,
    manualReason: current.manual_reason,
    context: {
      ...(current.context ?? {}),
      ...input.context,
    },
  });
}

export async function incrementClarificationAttempts(input: {
  env: ApiBindings;
  schemaName: string;
  conversationId: string;
}): Promise<Conversation> {
  const current = await selectConversationById({
    env: input.env,
    schemaName: input.schemaName,
    conversationId: input.conversationId,
  });

  if (!current) {
    throw new Error("conversation.not_found");
  }

  return mapConversationRow(
    await updateConversationRow({
      env: input.env,
      schemaName: input.schemaName,
      conversationId: input.conversationId,
      patch: {
        clarification_attempts: (current.clarification_attempts ?? 0) + 1,
        updated_at: new Date().toISOString(),
      },
    }),
  );
}
