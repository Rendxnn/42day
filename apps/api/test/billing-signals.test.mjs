import assert from "node:assert/strict";
import test from "node:test";
import { detectSignals } from "../src/modules/message-router/signal-detector.ts";

function detect(text, state = "awaiting_normal_billing_info") {
  return detectSignals({
    message: {
      providerMessageId: "msg-1",
      from: "573001234567",
      type: "text",
      text,
      timestamp: new Date().toISOString(),
    },
    state,
  });
}

test("detecta solicitud de factura electronica por frase directa", () => {
  const signals = detect("necesito factura electronica");
  assert.equal(signals.wantsElectronicBilling, true);
});

test("detecta solicitud de factura electronica por razon social nit y correo", () => {
  const signals = detect("mi razon social es Demo SAS, nit 900123, correo demo@correo.com");
  assert.equal(signals.wantsElectronicBilling, true);
});

test("detecta intencion de cambio de datos de facturacion", () => {
  const signals = detect("hay cambios en la factura");
  assert.equal(signals.billingDataChanged, true);
});

test("detecta cuando el cliente no puede compartir ubicacion", () => {
  const signals = detect("no puedo enviarla porque no tengo ubicacion en el celular", "awaiting_address");
  assert.equal(signals.cannotShareLocation, true);
  assert.equal(signals.looksLikeAddress, false);
});

test("detecta direccion escrita estructurada", () => {
  const signals = detect("calle 74 sur # 35-145, sabaneta", "awaiting_address");
  assert.equal(signals.looksLikeAddress, true);
  assert.equal(signals.cannotShareLocation, false);
});
