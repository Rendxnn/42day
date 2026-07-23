import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ordersViewPath = new URL("../src/orders.tsx", import.meta.url);
const dashboardAppPath = new URL("../src/App.tsx", import.meta.url);

test("a notification focus is consumed once and cannot reopen an order during polling", async () => {
  const [ordersView, dashboardApp] = await Promise.all([
    readFile(ordersViewPath, "utf8"),
    readFile(dashboardAppPath, "utf8"),
  ]);

  assert.match(ordersView, /onFocusOrderHandled: \(orderId: string\) => void/);
  assert.match(ordersView, /onFocusOrderHandled\(target\.id\)/);
  assert.match(ordersView, /\[allOrders, focusOrderId, onFocusOrderHandled\]/);
  assert.match(dashboardApp, /setFocusedOrderId\(\(current\) => current === orderId \? "" : current\)/);
});
