import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { redactSemanticParserResult } from "../src/features/chat-routing/shared/tracing.ts";

const operationPlanPath = new URL("../src/features/chat-routing/semantic/operation-plan.ts", import.meta.url);
const httpPath = new URL("../../../packages/t-router/src/core/http.ts", import.meta.url);

test("redacta facturacion y direccion del snapshot semantico", () => {
  const redacted = redactSemanticParserResult({
    intent: "unknown",
    confidence: 0.9,
    items: [],
    addressText: "Calle privada 123",
    addressDetails: "Apto privado 5",
    draftFacts: {
      deliveryAddressText: "Carrera privada 4",
      deliveryAddressDetails: "Torre privada",
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
  assert.equal(redacted.addressDetails, "[redacted]");
  assert.equal(redacted.draftFacts.deliveryAddressText, "[redacted]");
  assert.equal(redacted.draftFacts.deliveryAddressDetails, "[redacted]");
  assert.deepEqual(redacted.draftFacts.billing, { type: "normal", confidence: 0.9 });
});

test("los diagnosticos del proveedor conservan codigos seguros, sin cuerpo de respuesta", async () => {
  const operationPlan = await readFile(operationPlanPath, "utf8");
  const http = await readFile(httpPath, "utf8");

  assert.match(operationPlan, /SemanticOperationPlanInferenceError/);
  assert.match(operationPlan, /upstreamHttpStatus/);
  assert.match(operationPlan, /fallbackFromProviderId/);
  assert.match(operationPlan, /safeProviderFailure/);
  assert.match(http, /httpStatus: response\.status/);
  assert.doesNotMatch(http, /causeData.*parsed\.message/);
});
