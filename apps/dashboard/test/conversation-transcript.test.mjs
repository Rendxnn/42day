import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ordersPath = new URL("../src/orders.tsx", import.meta.url);
const apiPath = new URL("../src/api.ts", import.meta.url);
const stylesPath = new URL("../src/styles.css", import.meta.url);

test("el detalle abierto carga y actualiza el historial sin inflar el listado de pedidos", async () => {
  const [orders, api] = await Promise.all([
    readFile(ordersPath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.match(api, /getConversationTranscript/);
  assert.match(api, /conversations\/\$\{encodeURIComponent\(conversationId\)\}\/messages/);
  assert.match(orders, /getConversationTranscript\(targetTenantSlug, targetConversationId\)/);
  assert.match(orders, /window\.setInterval\(\(\) => \{/);
  assert.match(orders, /\}, 8000\)/);
});

test("la conversación distingue cliente y ParaHoy, conserva saltos y representa adjuntos", async () => {
  const [orders, styles] = await Promise.all([
    readFile(ordersPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(orders, /function ConversationMessageBubble/);
  assert.match(orders, /whitespace-pre-wrap/);
  assert.match(orders, /justify-end/);
  assert.match(orders, /justify-start/);
  assert.match(orders, /Mensaje de voz/);
  assert.match(orders, /Ubicacion compartida/);
  assert.match(orders, /formatTranscriptDate/);
  assert.match(styles, /\.conversation-transcript/);
});

test("la vista contempla carga, vacío, error e historiales largos", async () => {
  const orders = await readFile(ordersPath, "utf8");

  assert.match(orders, /Cargando conversacion/);
  assert.match(orders, /Todavia no hay mensajes registrados/);
  assert.match(orders, /transcriptError/);
  assert.match(orders, /Mostrando los mensajes mas recientes/);
});

test("bandeja usa el panel derecho y tablero conserva el modal", async () => {
  const orders = await readFile(ordersPath, "utf8");

  assert.match(orders, /function openConversation\(order: OpenOrderSummary\)/);
  assert.match(orders, /if \(layout === "queue"\)/);
  assert.match(orders, /openConversationDetail \? \(\s*<OpenConversationDetailPanel/);
  assert.match(orders, /layout === "queue" \? "xl:hidden" : ""/);
  assert.match(orders, /onOpenChat=\{openConversation\}/);
});
