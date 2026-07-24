import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isValidNormalBillingFullName } from "../src/features/chat-routing/checkout/billing-helpers.ts";
import { detectSignals } from "../src/modules/message-router/signal-detector.ts";

const routerPath = new URL("../src/features/chat-routing/router.ts", import.meta.url);

test("accepts a normal billing full name without relying on semantic planning", () => {
  assert.equal(isValidNormalBillingFullName("Yohana Fernandez Ortiz"), true);
  assert.equal(isValidNormalBillingFullName("Yohana"), false);
  assert.equal(isValidNormalBillingFullName("quiero cambiar pedido"), false);
});

test("recognizes yes or no while asking whether to reuse billing data", () => {
  const signals = detectSignals({
    message: {
      providerMessageId: "billing-reuse-1",
      from: "573001234567",
      type: "text",
      text: "si",
      timestamp: new Date().toISOString(),
    },
    state: "awaiting_billing_reuse_confirmation",
  });

  assert.equal(signals.confirmation, "yes");
});

test("routes normal and electronic billing before the semantic fallback", async () => {
  const source = await readFile(routerPath, "utf8");
  const semanticFallbackIndex = source.indexOf("if (await trySemanticFallback(input))");
  const normalBillingIndex = source.indexOf('input.conversation.state === "awaiting_normal_billing_info"');
  const electronicBillingIndex = source.indexOf('input.conversation.state === "awaiting_electronic_billing_info"');

  assert.ok(normalBillingIndex > -1 && normalBillingIndex < semanticFallbackIndex);
  assert.ok(electronicBillingIndex > -1 && electronicBillingIndex < semanticFallbackIndex);
  assert.match(source, /tryHandleNormalBillingInfo\(input/);
  assert.match(source, /tryHandleElectronicBillingInfo\(input\)/);
});
