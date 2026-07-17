import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../../../supabase/migrations/20260717051024_out_of_stock_order_adjustment.sql", import.meta.url);
const semanticOrderPath = new URL("../src/features/chat-routing/semantic/order.ts", import.meta.url);
const outOfStockRoutePath = new URL("../src/features/dashboard/routes/orders/out-of-stock.ts", import.meta.url);
const notificationsPath = new URL("../src/features/dashboard/support/notifications.ts", import.meta.url);
const tracingPath = new URL("../src/features/chat-routing/shared/tracing.ts", import.meta.url);

test("the out-of-stock prompt groups every unavailable item and uses natural-language adjustments", async () => {
  const source = await readFile(notificationsPath, "utf8");
  assert.match(source, /items\.map\(\(item\) => `• \$\{item\.quantity/);
  assert.match(source, /cámbiame los productos agotados/);
  assert.doesNotMatch(source, /número de la opción que prefieras/);
});

test("semantic adjustment removes unavailable draft lines and preserves their quantity for one replacement", async () => {
  const source = await readFile(semanticOrderPath, "utf8");
  assert.match(source, /state === "awaiting_order_adjustment"/);
  assert.match(source, /removeItemsFromDraftOrder/);
  assert.match(source, /unavailableItems/);
  assert.match(source, /actions\.length === 1 && pendingAdjustment/);
  assert.match(source, /proceedToNextOrderStep\(input, \{ menu: payload\.menu, draft: payload\.draft, context \}\)/);
});

test("restaurant out-of-stock reporting persists all affected lines instead of only the first", async () => {
  const source = await readFile(outOfStockRoutePath, "utf8");
  assert.match(source, /const selections = body\.items\.map/);
  assert.match(source, /replacementMenuItemsByUnavailableItem/);
  assert.match(source, /state: "awaiting_order_adjustment"/);
});

test("the tenant adjustment RPC locks, validates availability, and synchronizes the revised draft atomically", async () => {
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /confirm_order_adjustment/);
  assert.match(migration, /for update/);
  assert.match(migration, /adjustment_contains_unavailable_item/);
  assert.match(migration, /delete from %1\$I\.order_items/);
  assert.match(migration, /insert into %1\$I\.order_items/);
  assert.match(migration, /awaiting_restaurant_confirmation/);
  assert.match(migration, /configure_new_tenant_order_adjustment/);
});

test("routing diagnostics serialize semantic inference and per-item outcomes for Worker tail", async () => {
  const tracing = await readFile(tracingPath, "utf8");
  const semanticOrder = await readFile(semanticOrderPath, "utf8");
  assert.match(tracing, /console\.info\(JSON\.stringify/);
  assert.match(semanticOrder, /semantic_draft_item_resolved/);
  assert.match(semanticOrder, /semantic_state_directives\.failed/);
  assert.match(semanticOrder, /semantic_order_partially_applied/);
});
