import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const conversationsServicePath = new URL("../src/features/conversations/service.ts", import.meta.url);
const statusRoutePath = new URL("../src/features/dashboard/routes/orders/status.ts", import.meta.url);
const semanticOrderPath = new URL("../src/features/chat-routing/semantic/order.ts", import.meta.url);

test("a cancellation completes and clears the prior conversation workflow", async () => {
  const service = await readFile(conversationsServicePath, "utf8");

  assert.match(service, /export async function completeConversationAfterOrderCancellation/);
  assert.match(service, /export async function completeConversationAfterTerminalOrder/);
  assert.match(service, /state: "completed"/);
  assert.match(service, /context: \{\}/);
  assert.match(service, /current_draft_order_id: null/);
  assert.match(service, /automation_enabled: true/);
  assert.match(service, /automation_change_reason: input\.reason/);
  assert.match(service, /!\["completed", "expired"\]\.includes\(conversation\.state\)/);
});

test("restaurant and semantic customer cancellation paths use the same conversation reset", async () => {
  const [statusRoute, semanticOrder] = await Promise.all([
    readFile(statusRoutePath, "utf8"),
    readFile(semanticOrderPath, "utf8"),
  ]);

  assert.match(statusRoute, /if \(body\.status === "cancelled"\)/);
  assert.match(statusRoute, /status: "cancelled", updated_at: now/);
  assert.match(statusRoute, /completeConversationAfterTerminalOrder/);
  assert.match(semanticOrder, /cancel_order/);
  assert.match(semanticOrder, /cancelPendingCustomerReplacementOrder/);
  assert.match(semanticOrder, /completeConversationAfterOrderCancellation/);
});

test("delivering an order resets automation so the next inbound starts fresh", async () => {
  const [service, statusRoute] = await Promise.all([
    readFile(conversationsServicePath, "utf8"),
    readFile(statusRoutePath, "utf8"),
  ]);

  assert.match(statusRoute, /body\.status === "cancelled" \|\| body\.status === "delivered"/);
  assert.match(statusRoute, /reason: body\.status === "cancelled" \? "order_cancelled" : "order_delivered"/);
  assert.match(service, /state: "completed"/);
  assert.match(service, /automation_enabled: true/);
  assert.match(service, /current_draft_order_id: null/);
});

test("status transitions cannot skip payment or unfinished kitchen work", async () => {
  const statusRoute = await readFile(statusRoutePath, "utf8");

  assert.match(statusRoute, /validateOrderStatusTransition/);
  assert.match(statusRoute, /order_payment_not_confirmed/);
  assert.match(statusRoute, /order_kitchen_not_completed/);
  assert.match(statusRoute, /\(order\.kitchen_progress \?\? 0\) !== 100/);
  assert.match(statusRoute, /order\.status === "on_the_way"/);
});
