import assert from "node:assert/strict";
import test from "node:test";
import { validateDraftForConfirmation } from "../../../packages/core/src/validation.ts";

test("bloquea confirmacion cuando un item tiene configuracion pendiente", () => {
  const validation = validateDraftForConfirmation({
    id: "draft-1",
    status: "needs_clarification",
    fulfillmentType: "pickup",
    paymentMethod: "cash",
    billing: {
      type: "normal",
      fullName: "Cliente Demo",
    },
    items: [
      {
        name: "Bowl personalizado",
        quantity: 1,
        unitPrice: 20000,
        lineTotal: 20000,
        options: {
          mode: "pending_clarification",
          source: "semantic",
          validation: {
            status: "needs_clarification",
            missingRequiredOptionNames: ["Salsa"],
          },
        },
      },
    ],
    subtotal: 20000,
    deliveryFee: 0,
    discountTotal: 0,
    total: 20000,
  });

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes("draft_order.items_require_configuration"));
});

test("bloquea confirmacion cuando falta la facturacion", () => {
  const validation = validateDraftForConfirmation({
    id: "draft-2",
    status: "draft",
    fulfillmentType: "pickup",
    paymentMethod: "cash",
    items: [
      {
        name: "Almuerzo ejecutivo",
        quantity: 1,
        unitPrice: 18000,
        lineTotal: 18000,
      },
    ],
    subtotal: 18000,
    deliveryFee: 0,
    discountTotal: 0,
    total: 18000,
  });

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes("draft_order.billing_required"));
});
