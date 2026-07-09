import assert from "node:assert/strict";
import test from "node:test";
import { validateDraftForConfirmation } from "../../../packages/core/src/validation.ts";

function buildBaseDraft(overrides = {}) {
  return {
    id: "draft-billing",
    status: "draft",
    fulfillmentType: "pickup",
    paymentMethod: "cash",
    items: [
      {
        name: "Menu del dia",
        quantity: 1,
        unitPrice: 18000,
        lineTotal: 18000,
      },
    ],
    subtotal: 18000,
    deliveryFee: 0,
    discountTotal: 0,
    total: 18000,
    ...overrides,
  };
}

test("bloquea confirmacion cuando falta billing snapshot", () => {
  const validation = validateDraftForConfirmation(buildBaseDraft());

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes("draft_order.billing_required"));
});

test("permite pickup con billing normal y solo fullName", () => {
  const validation = validateDraftForConfirmation(buildBaseDraft({
    billing: {
      type: "normal",
      fullName: "Cliente Demo",
    },
  }));

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
});

test("requiere billingAddress para delivery con billing normal", () => {
  const validation = validateDraftForConfirmation(buildBaseDraft({
    fulfillmentType: "delivery",
    deliveryAddress: "Calle 123 #45-67",
    billing: {
      type: "normal",
      fullName: "Cliente Demo",
    },
    deliveryFee: 4000,
    total: 22000,
  }));

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes("draft_order.billing_address_required"));
});

test("requiere legalName, taxId y email para billing electronico", () => {
  const validation = validateDraftForConfirmation(buildBaseDraft({
    billing: {
      type: "electronic",
      legalName: "Mi Empresa SAS",
      taxId: "",
      email: "",
    },
  }));

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes("draft_order.billing_tax_id_required"));
  assert.ok(validation.errors.includes("draft_order.billing_email_required"));
});
