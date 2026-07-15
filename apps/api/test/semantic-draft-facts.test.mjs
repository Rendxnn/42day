import assert from "node:assert/strict";
import test from "node:test";
import { buildSemanticDraftFacts } from "../src/features/chat-routing/semantic/draft-facts.ts";

const emptySignals = {
  normalizedText: "",
  numericSelection: null,
  isGreeting: false,
  wantsMenu: false,
  humanRequested: false,
  fulfillmentType: null,
  paymentMethod: null,
  confirmation: null,
  wantsElectronicBilling: false,
  billingDataChanged: false,
  looksLikeAddress: false,
  hasTransferProofCandidate: false,
  doneAddingItems: false,
};

test("construye hechos de draft independientes desde un solo mensaje semantico", () => {
  const facts = buildSemanticDraftFacts({
    intent: "order",
    confidence: 0.9,
    items: [],
    draftFacts: {
      fulfillmentText: "domicilio",
      fulfillmentConfidence: 0.95,
      paymentText: "efectivo",
      paymentConfidence: 0.95,
      deliveryAddressText: "Calle 10 # 5-20",
      deliveryAddressConfidence: 0.9,
      billing: {
        type: "normal",
        fullName: "Samuel Rendon",
        billingAddress: "Carrera 7 # 12-34",
        confidence: 0.9,
      },
    },
  }, {
    ...emptySignals,
    fulfillmentType: "delivery",
    paymentMethod: "cash",
  });

  assert.equal(facts.fulfillmentType, "delivery");
  assert.equal(facts.paymentMethod, "cash");
  assert.equal(facts.deliveryAddressText, "Calle 10 # 5-20");
  assert.deepEqual(facts.billing, {
    type: "normal",
    fullName: "Samuel Rendon",
    billingAddress: "Carrera 7 # 12-34",
  });
});

test("descarta hechos sensibles de baja confianza", () => {
  const facts = buildSemanticDraftFacts({
    intent: "unknown",
    confidence: 0.9,
    items: [],
    draftFacts: {
      deliveryAddressText: "Direccion dudosa",
      deliveryAddressConfidence: 0.4,
      billing: {
        type: "normal",
        fullName: "Nombre dudoso",
        confidence: 0.4,
      },
    },
  }, emptySignals);

  assert.equal(facts.deliveryAddressText, undefined);
  assert.equal(facts.billing, undefined);
});
