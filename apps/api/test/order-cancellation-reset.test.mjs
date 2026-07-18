import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const conversationsServicePath = new URL("../src/features/conversations/service.ts", import.meta.url);
const statusRoutePath = new URL("../src/features/dashboard/routes/orders/status.ts", import.meta.url);
const semanticOrderPath = new URL("../src/features/chat-routing/semantic/order.ts", import.meta.url);

test("a cancellation completes and clears the prior conversation workflow", async () => {
  const service = await readFile(conversationsServicePath, "utf8");

  assert.match(service, /export async function completeConversationAfterOrderCancellation/);
  assert.match(service, /state: "completed"/);
  assert.match(service, /context: \{\}/);
  assert.match(service, /current_draft_order_id: null/);
  assert.match(service, /automation_enabled: true/);
  assert.match(service, /automation_change_reason: "order_cancelled"/);
  assert.match(service, /!\["completed", "expired"\]\.includes\(conversation\.state\)/);
});

test("restaurant and semantic customer cancellation paths use the same conversation reset", async () => {
  const [statusRoute, semanticOrder] = await Promise.all([
    readFile(statusRoutePath, "utf8"),
    readFile(semanticOrderPath, "utf8"),
  ]);

  assert.match(statusRoute, /if \(body\.status === "cancelled"\)/);
  assert.match(statusRoute, /status: "cancelled", updated_at: now/);
  assert.match(statusRoute, /completeConversationAfterOrderCancellation/);
  assert.match(semanticOrder, /cancel_order/);
  assert.match(semanticOrder, /cancelPendingCustomerReplacementOrder/);
  assert.match(semanticOrder, /completeConversationAfterOrderCancellation/);
});
