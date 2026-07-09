import assert from "node:assert/strict";
import test from "node:test";
import { mapDraftOrder } from "../src/features/draft-orders/mappers.ts";
import { mapOrder } from "../src/features/orders/mappers.ts";
import { mapOrderSummary } from "../src/features/dashboard/support/orders.ts";

const billingRow = {
  billing_type: "electronic",
  billing_profile_id: "profile-1",
  billing_full_name: null,
  billing_address: null,
  billing_legal_name: "Demo SAS",
  billing_tax_id: "900123456",
  billing_email: "demo@correo.com",
};

test("mapDraftOrder expone billing snapshot sin cambios", () => {
  const draft = mapDraftOrder({
    id: "draft-1",
    status: "draft",
    conversation_id: "conv-1",
    customer_id: "customer-1",
    location_id: "loc-1",
    fulfillment_type: "pickup",
    service_timing: "asap",
    payment_method: "cash",
    subtotal: 18000,
    delivery_fee: 0,
    discount_total: 0,
    total: 18000,
    created_at: "2026-07-08T00:00:00.000Z",
    updated_at: "2026-07-08T00:00:00.000Z",
    ...billingRow,
  }, []);

  assert.deepEqual(draft.billing, {
    type: "electronic",
    profileId: "profile-1",
    fullName: undefined,
    billingAddress: undefined,
    legalName: "Demo SAS",
    taxId: "900123456",
    email: "demo@correo.com",
  });
});

test("mapOrder copia billing snapshot al contrato de orden", () => {
  const order = mapOrder({
    id: "order-1",
    draft_order_id: "draft-1",
    customer_id: "customer-1",
    location_id: "loc-1",
    status: "pending_restaurant_confirmation",
    fulfillment_type: "pickup",
    service_timing: "asap",
    payment_method: "cash",
    subtotal: 18000,
    delivery_fee: 0,
    discount_total: 0,
    total: 18000,
    created_at: "2026-07-08T00:00:00.000Z",
    updated_at: "2026-07-08T00:00:00.000Z",
    ...billingRow,
  });

  assert.equal(order.billing?.legalName, "Demo SAS");
  assert.equal(order.billing?.taxId, "900123456");
  assert.equal(order.billing?.email, "demo@correo.com");
});

test("mapOrderSummary mantiene billing para dashboard detail payload", () => {
  const summary = mapOrderSummary({
    id: "order-2",
    draft_order_id: "draft-2",
    customer_id: "customer-2",
    status: "accepted",
    fulfillment_type: "delivery",
    payment_method: "transfer",
    subtotal: 25000,
    delivery_fee: 4000,
    discount_total: 0,
    total: 29000,
    created_at: "2026-07-08T00:00:00.000Z",
    updated_at: "2026-07-08T00:00:00.000Z",
    customer_address_text: "Cra 10 # 20-30",
    ...billingRow,
  }, {
    id: "customer-2",
    phone: "573001234567",
    name: "Cliente Demo",
  });

  assert.deepEqual(summary.billing, {
    type: "electronic",
    profileId: "profile-1",
    fullName: undefined,
    billingAddress: undefined,
    legalName: "Demo SAS",
    taxId: "900123456",
    email: "demo@correo.com",
  });
});
