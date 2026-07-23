import assert from "node:assert/strict";
import test from "node:test";
import {
  hasExplicitFulfillmentEvidence,
  hasExplicitPaymentEvidence,
} from "../src/features/chat-routing/semantic/evidence.ts";

test("acepta entrega y pago cuando aparecen explicitamente en una frase compuesta", () => {
  const text = "listo está bien, sería para recoger porfa y te pago con transferencia";

  assert.equal(hasExplicitFulfillmentEvidence(text, "pickup", "awaiting_more_items"), true);
  assert.equal(hasExplicitPaymentEvidence(text, "transfer", "awaiting_more_items"), true);
  assert.equal(hasExplicitFulfillmentEvidence(text, "delivery", "awaiting_more_items"), false);
  assert.equal(hasExplicitPaymentEvidence(text, "cash", "awaiting_more_items"), false);
});

test("rechaza inferencias de entrega o pago sin evidencia del cliente", () => {
  const text = "dame otras papas";

  assert.equal(hasExplicitFulfillmentEvidence(text, "pickup", "awaiting_more_items"), false);
  assert.equal(hasExplicitFulfillmentEvidence(text, "delivery", "awaiting_more_items"), false);
  assert.equal(hasExplicitPaymentEvidence(text, "cash", "awaiting_more_items"), false);
  assert.equal(hasExplicitPaymentEvidence(text, "transfer", "awaiting_more_items"), false);
});

test("acepta selecciones numericas solo en el paso que las solicitó", () => {
  assert.equal(hasExplicitFulfillmentEvidence("1", "delivery", "awaiting_fulfillment_type"), true);
  assert.equal(hasExplicitFulfillmentEvidence("1", "delivery", "awaiting_more_items"), false);
  assert.equal(hasExplicitPaymentEvidence("2", "transfer", "awaiting_payment_method"), true);
  assert.equal(hasExplicitPaymentEvidence("2", "transfer", "awaiting_more_items"), false);
});
