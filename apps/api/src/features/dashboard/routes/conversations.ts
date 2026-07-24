import { Hono } from "hono";
import type { ConversationTranscript } from "@42day/types";
import { changeConversationAutomation } from "../../conversations/service";
import type { ApiBindings } from "../../../lib/bindings";
import { createSupabaseRestClient, SupabaseRestError } from "../../../lib/supabase-rest";
import type { DashboardVariables } from "../types";
import { mapConversationAutomation } from "../support/orders";
import {
  mapConversationTranscriptMessage,
  parseTranscriptLimit,
  type ConversationMessageRow,
} from "../support/conversation-transcript";

export const conversationsDashboardRoutes = new Hono<{ Bindings: ApiBindings; Variables: DashboardVariables }>();

type ConversationIdentityRow = {
  id: string;
};

conversationsDashboardRoutes.get("/:tenantSlug/conversations/:conversationId/messages", async (c) => {
  const tenant = c.get("tenant");
  const conversationId = c.req.param("conversationId");
  const limit = parseTranscriptLimit(c.req.query("limit"));
  const supabase = createSupabaseRestClient(c.env);

  const conversations = await supabase.select<ConversationIdentityRow>({
    schema: tenant.schema_name,
    table: "conversations",
    query: {
      select: "id",
      id: `eq.${conversationId}`,
      limit: 1,
    },
  });

  if (!conversations[0]) {
    return c.json({ error: "conversation_not_found" }, 404);
  }

  // Fetch newest first so the cap always keeps the most relevant part of a
  // long conversation, then reverse it for a natural chronological transcript.
  // Provider payloads are intentionally excluded from the dashboard contract.
  const rows = await supabase.select<ConversationMessageRow>({
    schema: tenant.schema_name,
    table: "messages",
    query: {
      select: "id,direction,message_type,text,status,created_at",
      conversation_id: `eq.${conversationId}`,
      order: "created_at.desc,id.desc",
      limit: limit + 1,
    },
  });
  const hasMore = rows.length > limit;
  const messages = rows
    .slice(0, limit)
    .reverse()
    .map(mapConversationTranscriptMessage);
  const response: ConversationTranscript = {
    conversationId,
    messages,
    hasMore,
  };

  return c.json(response);
});

conversationsDashboardRoutes.patch("/:tenantSlug/conversations/:conversationId/automation", async (c) => {
  const body = await c.req.json<{ enabled?: boolean; expectedUpdatedAt?: string }>().catch(() => undefined);
  if (!body || typeof body.enabled !== "boolean" || !body.expectedUpdatedAt) return c.json({ error: "invalid_automation_update" }, 400);
  const tenant = c.get("tenant");
  const authUser = c.get("authUser");
  try {
    const conversation = await changeConversationAutomation({ env: c.env, schemaName: tenant.schema_name, conversationId: c.req.param("conversationId"), enabled: body.enabled, expectedUpdatedAt: body.expectedUpdatedAt, changedBy: authUser.id });
    return c.json(mapConversationAutomation({ id: conversation.id, customer_id: conversation.customerId, state: conversation.state, manual_reason: conversation.manualReason, automation_enabled: conversation.automationEnabled, automation_resume_state: conversation.automationResumeState, automation_changed_at: conversation.automationChangedAt, automation_changed_by: conversation.automationChangedBy, automation_change_reason: conversation.automationChangeReason, updated_at: conversation.updatedAt, created_at: conversation.createdAt }));
  } catch (error) {
    const code = error instanceof SupabaseRestError
      ? `${error.message}:${error.body}`
      : error instanceof Error ? error.message : "conversation_update_failed";
    if (code.includes("conversation_not_found")) return c.json({ error: "conversation_not_found" }, 404);
    if (code.includes("conversation_terminal")) return c.json({ error: "conversation_terminal" }, 409);
    if (code.includes("conversation_stale") || code === "conversation.row_missing") return c.json({ error: "conversation_stale" }, 409);
    throw error;
  }
});
