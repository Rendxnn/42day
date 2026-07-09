import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBillingDefaults,
  parseElectronicBillingText,
  readPendingBillingContext,
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
