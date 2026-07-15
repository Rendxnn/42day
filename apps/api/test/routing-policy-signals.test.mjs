import assert from "node:assert/strict";
import test from "node:test";
import {
  detectSignals,
  parseSemanticFulfillmentSelection,
  parseSemanticPaymentMethod,
} from "../src/modules/message-router/signal-detector.ts";

function detect(text, state) {
  return detectSignals({
    message: {
      providerMessageId: "msg-routing-policy",
      from: "573001234567",
      type: "text",
      text,
      timestamp: new Date().toISOString(),
    },
    state,
  });
}

test("solo acepta un pago deterministico exacto en el estado de pago", () => {
  assert.equal(detect("efectivo", "awaiting_payment_method").paymentMethod, "cash");
  assert.equal(detect("quiero pagar en efectivo y agregar un jugo", "awaiting_payment_method").paymentMethod, null);
  assert.equal(detect("efectivo", "awaiting_more_items").paymentMethod, null);
});

test("solo acepta fulfillment y confirmacion deterministas exactos en estados permitidos", () => {
  assert.equal(detect("recoger", "awaiting_fulfillment_type").fulfillmentType, "pickup");
  assert.equal(detect("quiero recoger y agregar una bebida", "awaiting_fulfillment_type").fulfillmentType, null);
  assert.equal(detect("confirmo", "awaiting_confirmation").confirmation, "yes");
  assert.equal(detect("confirmo y agrega otro", "awaiting_confirmation").confirmation, null);
  assert.equal(detect("confirmo", "awaiting_more_items").confirmation, null);
});

test("solo normaliza valores semanticos canonicos antes de aplicarlos al draft", () => {
  assert.equal(parseSemanticPaymentMethod("transferencia"), "transfer");
  assert.equal(parseSemanticPaymentMethod("paga como quieras"), null);
  assert.equal(parseSemanticFulfillmentSelection("domicilio"), "delivery");
  assert.equal(parseSemanticFulfillmentSelection("mandalo donde estoy"), null);
});

test("solo trata como direccion deterministica un formato postal reconocible", () => {
  assert.equal(detect("calle 10 # 5-20", "awaiting_address").looksLikeAddress, true);
  assert.equal(detect("vivo por el parque central", "awaiting_address").looksLikeAddress, false);
});
