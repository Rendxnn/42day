import assert from "node:assert/strict";
import test from "node:test";
import {
  toCustomerSafeAddress,
  WHATSAPP_LOCATION_LABEL,
} from "../src/features/delivery-coverage/customer-safe-address.ts";

test("oculta pares de coordenadas y conserva direcciones legibles", () => {
  assert.equal(toCustomerSafeAddress("Ubicacion compartida: 6.1452718, -75.6144164"), undefined);
  assert.equal(toCustomerSafeAddress("6.1452718, -75.6144164"), undefined);
  assert.equal(toCustomerSafeAddress("Calle 74 sur # 35-145, Sabaneta"), "Calle 74 sur # 35-145, Sabaneta");
  assert.equal(toCustomerSafeAddress(WHATSAPP_LOCATION_LABEL), WHATSAPP_LOCATION_LABEL);
});
