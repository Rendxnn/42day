import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBillingDefaults,
  parseElectronicBillingText,
  readPendingBillingContext,
  resolveBillingReuseDecision,
  renderBillingProfile,
} from "../src/features/chat-routing/checkout/billing-helpers.ts";

test("aplica direccion de delivery al billing normal recordado", () => {
  const billing = applyBillingDefaults(
    {
      type: "normal",
      fullName: "Cliente Demo",
    },
    {
      id: "draft-1",
      status: "draft",
      fulfillmentType: "delivery",
      deliveryAddress: "Cra 10 # 20-30",
      items: [],
      subtotal: 0,
      deliveryFee: 0,
      discountTotal: 0,
      total: 0,
    },
  );

  assert.equal(billing.billingAddress, "Cra 10 # 20-30");
});

test("no reutiliza coordenadas tecnicas como direccion de facturacion", () => {
  const billing = applyBillingDefaults(
    {
      type: "normal",
      fullName: "Cliente Demo",
      billingAddress: "Ubicacion compartida: 6.1452718, -75.6144164",
    },
    {
      id: "draft-pickup",
      status: "draft",
      fulfillmentType: "pickup",
      items: [],
      subtotal: 0,
      deliveryFee: 0,
      discountTotal: 0,
      total: 0,
    },
  );

  assert.equal(billing.billingAddress, undefined);
});

test("lee pendingBilling para reutilizacion de perfil normal", () => {
  const pending = readPendingBillingContext({
    pendingBilling: {
      type: "normal",
      shouldReuseDeliveryAddress: true,
      reuseProfileId: "profile-1",
      fullName: "Cliente Demo",
      billingAddress: "Calle 1",
    },
  });

  assert.deepEqual(pending, {
    type: "normal",
    shouldReuseDeliveryAddress: true,
    reuseProfile: {
      id: "profile-1",
      customerId: "",
      type: "normal",
      fullName: "Cliente Demo",
      billingAddress: "Calle 1",
      legalName: undefined,
      taxId: undefined,
      email: undefined,
      createdAt: "",
      updatedAt: "",
    },
  });
});

test("parsea billing electronico separado por comas", () => {
  const parsed = parseElectronicBillingText("Demo SAS, 900123456, demo@correo.com");

  assert.deepEqual(parsed, {
    type: "electronic",
    legalName: "Demo SAS",
    taxId: "900123456",
    email: "demo@correo.com",
  });
});

test("lee pendingBilling para reutilizacion de perfil electronico", () => {
  const pending = readPendingBillingContext({
    pendingBilling: {
      type: "electronic",
      reuseProfileId: "profile-elec",
      legalName: "Demo SAS",
      taxId: "900123456",
      email: "demo@correo.com",
    },
  });

  assert.deepEqual(pending, {
    type: "electronic",
    shouldReuseDeliveryAddress: false,
    reuseProfile: {
      id: "profile-elec",
      customerId: "",
      type: "electronic",
      fullName: undefined,
      billingAddress: undefined,
      legalName: "Demo SAS",
      taxId: "900123456",
      email: "demo@correo.com",
      createdAt: "",
      updatedAt: "",
    },
  });
});

test("renderiza perfil normal reutilizado con hint de factura electronica", () => {
  const text = renderBillingProfile(
    {
      id: "profile-normal",
      customerId: "customer-1",
      type: "normal",
      fullName: "Cliente Demo",
      billingAddress: "Calle 45",
      createdAt: "2026-07-08T00:00:00.000Z",
      updatedAt: "2026-07-08T00:00:00.000Z",
    },
    {
      id: "draft-2",
      status: "draft",
      items: [],
      subtotal: 0,
      deliveryFee: 0,
      discountTotal: 0,
      total: 0,
    },
  );

  assert.match(text, /Nombre completo: Cliente Demo/);
  assert.match(text, /Si necesitas factura electrónica/);
});

test("prioriza billingDecision reuse para conservar la facturacion guardada", () => {
  const resolved = resolveBillingReuseDecision({
    billingDecision: "reuse",
  });

  assert.deepEqual(resolved, {
    reuseExisting: true,
    changeBilling: false,
    switchToElectronic: false,
  });
});

test("interpreta billingDecision change como solicitud de nuevos datos", () => {
  const resolved = resolveBillingReuseDecision({
    billingDecision: "change",
  });

  assert.deepEqual(resolved, {
    reuseExisting: false,
    changeBilling: true,
    switchToElectronic: false,
  });
});

test("interpreta billingDecision switch_to_electronic como cambio a factura electronica", () => {
  const resolved = resolveBillingReuseDecision({
    billingDecision: "switch_to_electronic",
  });

  assert.deepEqual(resolved, {
    reuseExisting: false,
    changeBilling: false,
    switchToElectronic: true,
  });
});
