import { Hono } from "hono";
import { changeConversationAutomation } from "../../conversations/service";
import type { ApiBindings } from "../../../lib/bindings";
import { createSupabaseRestClient } from "../../../lib/supabase-rest";
import type { DashboardVariables } from "../types";
import { mapConversationAutomation } from "../support/orders";

export const conversationsDashboardRoutes = new Hono<{ Bindings: ApiBindings; Variables: DashboardVariables }>();

conversationsDashboardRoutes.patch("/:tenantSlug/conversations/:conversationId/automation", async (c) => {
  const body = await c.req.json<{ enabled?: boolean; expectedUpdatedAt?: string }>().catch(() => undefined);
  if (!body || typeof body.enabled !== "boolean" || !body.expectedUpdatedAt) return c.json({ error: "invalid_automation_update" }, 400);
  const tenant = c.get("tenant");
  const authUser = c.get("authUser");
  try {
    const conversation = await changeConversationAutomation({ env: c.env, schemaName: tenant.schema_name, conversationId: c.req.param("conversationId"), enabled: body.enabled, expectedUpdatedAt: body.expectedUpdatedAt, changedBy: authUser.id });
    const supabase = createSupabaseRestClient(c.env);
    if (body.enabled) await supabase.update({ schema: tenant.schema_name, table: "human_intervention_alerts", values: { status: "resolved", resolved_at: new Date().toISOString() }, query: { conversation_id: `eq.${conversation.id}`, type: "eq.support_requested", status: "eq.open" } });
    await supabase.insert({ schema: tenant.schema_name, table: "app_events", rows: { conversation_id: conversation.id, event_name: body.enabled ? "conversation.manual_resolved" : "conversation.manual_enabled", severity: "info", source: "dashboard", metadata: { actorId: authUser.id, automationEnabled: body.enabled } } }).catch(() => undefined);
    return c.json(mapConversationAutomation({ id: conversation.id, customer_id: conversation.customerId, state: conversation.state, manual_reason: conversation.manualReason, automation_enabled: conversation.automationEnabled, automation_resume_state: conversation.automationResumeState, automation_changed_at: conversation.automationChangedAt, automation_changed_by: conversation.automationChangedBy, automation_change_reason: conversation.automationChangeReason, updated_at: conversation.updatedAt, created_at: conversation.createdAt }));
  } catch (error) {
    const code = error instanceof Error ? error.message : "conversation_update_failed";
    if (code === "conversation.not_found") return c.json({ error: code }, 404);
    if (code === "conversation.terminal") return c.json({ error: code }, 409);
    if (code === "conversation.stale" || code === "conversation.row_missing") return c.json({ error: "conversation_stale" }, 409);
    throw error;
  }
});
