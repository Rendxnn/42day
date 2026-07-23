import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const orderServicePath = new URL("../src/features/orders/service.ts", import.meta.url);
const replacementSupportPath = new URL("../src/features/dashboard/support/orders.ts", import.meta.url);
const orderRoutesPath = new URL("../src/features/dashboard/routes/orders/index.ts", import.meta.url);
const migrationPath = new URL("../../../supabase/migrations/20260723191658_backfill_order_item_categories.sql", import.meta.url);

test("replacement candidates come only from visible, non-retired menu rows", async () => {
  const source = await readFile(replacementSupportPath, "utf8");

  assert.match(source, /is_available:\s*"eq\.true"/);
  assert.match(source, /removed_at:\s*"is\.null"/);
  assert.match(source, /is_active:\s*"eq\.true"/);
});

test("the order router does not shadow the canonical current-menu endpoint", async () => {
  const source = await readFile(orderRoutesPath, "utf8");

  assert.doesNotMatch(source, /registerOrdersMenuTodayRoute/);
  assert.doesNotMatch(source, /menu-today/);
});

test("confirmed order lines persist a category snapshot and old lines are backfilled", async () => {
  const service = await readFile(orderServicePath, "utf8");
  const migration = await readFile(migrationPath, "utf8");

  assert.match(service, /resolveOrderItemCategorySnapshots/);
  assert.match(service, /select:\s*"id,category"/);
  assert.match(service, /categorySnapshot/);
  assert.match(migration, /update %1\$I\.order_items oi/i);
  assert.match(migration, /set category_snapshot = p\.category/i);
  assert.match(migration, /from %1\$I\.products p/i);
});
