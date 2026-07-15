import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomerOrderStatusMessage, buildPaymentPrompt } from "../src/modules/message-router/response-composer.ts";
import { buildWelcomeMenuText } from "../src/features/menu/presenter.ts";

function buildMenu() {
  return {
    tenantSlug: "demo",
    tenantSchema: "tenant_demo",
    requestedDate: "2026-07-12",
    isFallbackMenu: false,
    location: {
      id: "location-1",
      name: "Sede principal",
      deliveryFeeFixed: 5000,
      pickupEnabled: true,
      deliveryEnabled: true,
      isActive: true,
    },
    menu: {
      id: "menu-1",
      locationId: "location-1",
      date: "2026-07-12",
      name: "Menu de hoy",
      status: "published",
    },
    items: [
      {
        id: "item-1",
        menuId: "menu-1",
        displayName: "Arepa",
        priceOverride: 12000,
        isAvailable: true,
        sortOrder: 1,
        product: {
          id: "product-1",
          name: "Arepa",
          basePrice: 12000,
          isActive: true,
        },
      },
    ],
    products: [],
  };
}

function buildDraft(overrides = {}) {
  return {
    id: "draft-1",
    status: "draft",
    items: [{ name: "Arepa", quantity: 1, unitPrice: 12000, lineTotal: 12000 }],
    subtotal: 12000,
    deliveryFee: 0,
    discountTotal: 0,
    total: 12000,
    ...overrides,
  };
}

test("da la bienvenida usando el nombre del restaurante", () => {
  const message = buildWelcomeMenuText(buildMenu(), "Restaurante Demo");

  assert.match(message, /¡Bienvenido a Restaurante Demo!/);
  assert.match(message, /¡Hola! 👋/);
});

test("no menciona domicilio cuando el pedido es para recoger", () => {
  const message = buildPaymentPrompt(buildDraft({ fulfillmentType: "pickup" }), buildMenu());

  assert.match(message, /¿Cómo prefieres pagar/);
  assert.doesNotMatch(message, /domicilio/i);
});

test("menciona el valor del domicilio cuando el pedido es delivery", () => {
  const message = buildPaymentPrompt(buildDraft({
    fulfillmentType: "delivery",
    deliveryFee: 5000,
    total: 17000,
  }), buildMenu());

  assert.match(message, /El valor del domicilio es de/);
  assert.match(message, /5\.000/);
});

test("explica que el pedido de delivery va en camino", () => {
  const message = buildCustomerOrderStatusMessage({ status: "on_the_way", fulfillmentType: "delivery" });

  assert.match(message, /salió en camino/i);
  assert.match(message, /domicilio/i);
});

test("explica que el pedido para recoger está listo", () => {
  const message = buildCustomerOrderStatusMessage({ status: "on_the_way", fulfillmentType: "pickup" });

  assert.match(message, /listo para que lo recojas/i);
});
