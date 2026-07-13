import assert from "node:assert/strict";
import test from "node:test";
import { redactSemanticParserResult } from "../src/features/chat-routing/shared/tracing.ts";

test("redacta facturacion y direccion del snapshot semantico", () => {
  const redacted = redactSemanticParserResult({
    intent: "unknown",
    confidence: 0.9,
    items: [],
    addressText: "Calle privada 123",
    draftFacts: {
      deliveryAddressText: "Carrera privada 4",
      deliveryAddressConfidence: 0.9,
      billing: {
        type: "normal",
        fullName: "Samuel Rendon",
        billingAddress: "Direccion privada",
        confidence: 0.9,
      },
    },
  });

  assert.equal(redacted.addressText, "[redacted]");
  assert.equal(redacted.draftFacts.deliveryAddressText, "[redacted]");
  assert.deepEqual(redacted.draftFacts.billing, { type: "normal", confidence: 0.9 });
});
