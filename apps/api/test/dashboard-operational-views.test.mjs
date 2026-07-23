import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardOrdersPath = new URL(
  "../../dashboard/src/orders.tsx",
  import.meta.url,
);
const orderTypesPath = new URL(
  "../../../packages/types/src/orders.ts",
  import.meta.url,
);
const orderListRoutePath = new URL(
  "../src/features/dashboard/routes/orders/list.ts",
  import.meta.url,
);

test("tablero y bandeja comparten las mismas agrupaciones operativas", async () => {
  const source = await readFile(dashboardOrdersPath, "utf8");

  assert.match(source, /function OrdersBoard/);
  assert.match(source, /function RestoredOrdersQueueList/);
  assert.match(source, /<RestoredOrdersQueueList/);
  assert.match(source, /groups=\{operationalGroups\}/);
  assert.match(source, /function getOperationalGroups/);
  assert.match(source, /type OperationalStageId = "open" \| "review" \| "preparing" \| "ready" \| "finished"/);
});

test("las tarjetas permiten progreso, controles y movimiento con bloqueos", async () => {
  const source = await readFile(dashboardOrdersPath, "utf8");

  assert.match(source, /type="range"/);
  assert.match(source, /step=\{25\}/);
  assert.match(source, /onPointerUp=/);
  assert.match(source, /draggable/);
  assert.match(source, /application\/x-parahoy-order/);
  assert.match(source, /Completar etapa para arrastrar/);
  assert.match(source, /function resolveDropStatus/);
  assert.match(source, /AutomationSwitch/);
  assert.match(source, /Cancelar pedido/);
});

test("la bandeja conserva la lista lateral y el detalle de escritorio", async () => {
  const source = await readFile(dashboardOrdersPath, "utf8");

  assert.match(source, /xl:grid-cols-\[minmax\(360px,440px\)_minmax\(0,1fr\)\]/);
  assert.match(source, /app-panel hidden min-w-0 overflow-hidden rounded-\[26px\] xl:block/);
  assert.match(source, /layout === "board" \? "" : "xl:hidden"/);
  assert.match(source, /function OperationalOrderCard/);
  assert.match(source, /function QueueKitchenProgress/);
});

test("cada pedido expone el control de automatizacion de su conversacion", async () => {
  const [types, listRoute] = await Promise.all([
    readFile(orderTypesPath, "utf8"),
    readFile(orderListRoutePath, "utf8"),
  ]);

  assert.match(types, /conversationAutomation\?: ConversationAutomation/);
  assert.match(listRoute, /conversationAutomation: conversation \? mapConversationAutomation\(conversation\) : undefined/);
});
