import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getAutomationTransition,
  resolvesOnConversationAutomationResume,
  routingHandoffAlertTypes,
} from "../src/features/conversations/automation-policy.ts";

const migrationPath = new URL("../../../supabase/migrations/20260714152849_conversation_automation_transaction_and_provisioning.sql", import.meta.url);
const dashboardPath = new URL("../../dashboard/src/App.tsx", import.meta.url);
const ordersPath = new URL("../../dashboard/src/orders.tsx", import.meta.url);

test("staff can pause an active conversation and preserve its resume state", () => {
  assert.deepEqual(getAutomationTransition({ enabled: false, state: "awaiting_payment_method" }), {
    state: "manual",
    resumeState: "awaiting_payment_method",
  });
});

test("staff resume restores the saved routing state", () => {
  assert.deepEqual(getAutomationTransition({ enabled: true, state: "manual", resumeState: "awaiting_address" }), {
    state: "awaiting_address",
  });
});

test("only routing-handoff alerts resolve when automation resumes", () => {
  assert.deepEqual(routingHandoffAlertTypes, [
    "support_requested",
    "parser_failed",
    "validation_failed_repeatedly",
    "technical_error",
    "order_change_requested",
  ]);
  for (const type of routingHandoffAlertTypes) assert.equal(resolvesOnConversationAutomationResume(type), true);
  assert.equal(resolvesOnConversationAutomationResume("transfer_payment_review"), false);
  assert.equal(resolvesOnConversationAutomationResume("order_pending_confirmation"), false);
  assert.equal(resolvesOnConversationAutomationResume("automation_disabled"), false);
});

test("the tenant RPC locks, checks stale and terminal conversations, and writes the state change atomically", async () => {
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /change_conversation_automation/);
  assert.match(migration, /for update/);
  assert.match(migration, /conversation_terminal/);
  assert.match(migration, /conversation_stale/);
  assert.match(migration, /insert into %1\$I\.app_events/);
  assert.match(migration, /if p_enabled and was_paused then[\s\S]*human_intervention_alerts/);
});

test("provisioning configures future tenants with the RPC, alert RLS, and Realtime", async () => {
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /configure_new_tenant_conversation_automation/);
  assert.match(migration, /create constraint trigger configure_new_tenant_conversation_automation/);
  assert.match(migration, /tenant members can read realtime human intervention alerts/);
  assert.match(migration, /alter publication supabase_realtime add table %I\.human_intervention_alerts/);
});

test("every open handoff alert is eligible for a once-per-alert notification", async () => {
  const dashboard = await readFile(dashboardPath, "utf8");
  for (const type of [
    "support_requested",
    "parser_failed",
    "validation_failed_repeatedly",
    "technical_error",
    "order_change_requested",
    "transfer_payment_review",
    "order_pending_confirmation",
    "automation_disabled",
  ]) assert.match(dashboard, new RegExp(`${type}:`));
  assert.match(dashboard, /alerts\.filter\(\(alert\) => !seenSupportAlertIdsRef\.current\.has\(alert\.id\)\)/);
  assert.match(dashboard, /seenSupportAlertIdsRef\.current\.add\(alert\.id\)/);
  assert.match(dashboard, /playNotificationSound\(\)/);
});

test("orderless, draft-linked, and order-linked open cards share the accessible automation control", async () => {
  const orders = await readFile(ordersPath, "utf8");
  assert.match(orders, /onOpenDetail=\{\(\) => setOpenConversationDetail\(order\)\}/);
  assert.match(orders, /function OpenConversationDetailPanel/);
  assert.match(orders, /role="switch"/);
  assert.match(orders, /aria-checked=\{enabled\}/);
  assert.match(orders, /automationConfirmation/);
});

test("the API delegates the mutation to the tenant-local RPC instead of composing partial updates", async () => {
  const service = await readFile(new URL("../src/features/conversations/service.ts", import.meta.url), "utf8");
  assert.match(service, /\.rpc<Record<string, unknown>>\(/);
  assert.match(service, /functionName: "change_conversation_automation"/);
  assert.match(service, /p_expected_updated_at: input\.expectedUpdatedAt/);
});
