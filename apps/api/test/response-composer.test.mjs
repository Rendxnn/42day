import assert from "node:assert/strict";
import test from "node:test";
import { buildClarificationPrompt, buildCustomerOrderStatusMessage, buildNormalBillingPrompt, buildOrderProgressSnapshot, buildOrderSummaryText, buildPaymentPrompt, buildProductConfigurationPrompt } from "../src/modules/message-router/response-composer.ts";
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
  assert.match(message, /escribe "asesor"/i);
});

test("el modo inicial no vuelve a pedir que escriba menu", () => {
  const prompt = buildClarificationPrompt("awaiting_mode_selection");

  assert.doesNotMatch(prompt, /si quieres ver el men[uú]/i);
  assert.match(prompt, /qué deseas pedir/i);
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

test("no ofrece factura electronica cuando el restaurante la desactiva", () => {
  const message = buildNormalBillingPrompt({
    fulfillmentType: "delivery",
    billingAddress: "Calle 10 # 5-20",
    electronicBillingEnabled: false,
  });

  assert.match(message, /factura normal/i);
  assert.doesNotMatch(message, /factura electr[óo]nica/i);
});

test("la confirmacion incluye entrega, facturacion y pago acumulados", () => {
  const message = buildOrderSummaryText(buildDraft({
    fulfillmentType: "delivery",
    deliveryFee: 5000,
    deliveryAddress: "Calle 10 # 5-20",
    total: 17000,
    billing: {
      type: "normal",
      fullName: "Samuel Rendon",
      billingAddress: "Carrera 7 # 12-34",
    },
  }), "cash");

  assert.match(message, /Arepa/);
  assert.match(message, /Domicilio: \$\s+5\.000/);
  assert.match(message, /Dirección de entrega: Calle 10 # 5-20/);
  assert.match(message, /Samuel Rendon/);
  assert.match(message, /Dirección de facturación: Carrera 7 # 12-34/);
  assert.match(message, /Pago: efectivo/);
});

test("el snapshot de progreso muestra campos pendientes y nunca coordenadas", () => {
  const message = buildOrderProgressSnapshot(buildDraft({
    fulfillmentType: "delivery",
    deliveryFee: 5000,
    total: 17000,
    resolvedDeliveryAddress: "Calle 10 # 5-20, Sabaneta",
    deliveryAddressDetails: "Torre 3, apto 402",
    customerLatitude: 6.15123,
    customerLongitude: -75.61234,
    paymentMethod: "cash",
    items: [{
      name: "Arepa",
      quantity: 1,
      unitPrice: 12000,
      lineTotal: 12000,
      notes: "sin salsa",
      options: { resolvedOptions: [{ optionId: "option-1", optionName: "Queso", selectedValues: [{ valueId: "value-1", valueName: "Extra", priceDelta: 0 }] }] },
    }],
  }));

  assert.match(message, /Arepa/);
  assert.match(message, /sin salsa/);
  assert.match(message, /Calle 10 # 5-20, Sabaneta/);
  assert.match(message, /Torre 3, apto 402/);
  assert.match(message, /Efectivo/);
  assert.doesNotMatch(message, /6\.15123|-75\.61234/);

  const incomplete = buildOrderProgressSnapshot(buildDraft({ items: [] }));
  assert.match(incomplete, /Productos: Pendiente/);
  assert.match(incomplete, /Dirección: Pendiente/);
  assert.match(incomplete, /Total: Pendiente de definir entrega/);
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

test("el menú inicial muestra los componentes y límites de productos compuestos", () => {
  const menu = buildMenu();
  menu.items[0].displayName = "Picada armable";
  menu.items[0].product.productType = "composite";
  menu.items[0].product.options = [{
    id: "proteins",
    name: "Proteinas",
    type: "single",
    isRequired: true,
    minSelect: 2,
    maxSelect: 3,
    sortOrder: 0,
    values: [
      { id: "beef", name: "Res", priceDelta: 0, isActive: true, sortOrder: 0 },
      { id: "pork", name: "Bondiola", priceDelta: 0, isActive: true, sortOrder: 1 },
    ],
  }];

  const message = buildWelcomeMenuText(menu, "Restaurante Demo");
  assert.match(message, /Proteinas.*elige 2–3.*máx\. 3/i);
  assert.match(message, /Res, Bondiola/);
});

test("el prompt de facturacion no muestra una pseudo direccion con coordenadas", () => {
  const message = buildNormalBillingPrompt({
    fulfillmentType: "delivery",
    billingAddress: "Ubicacion compartida: 6.1452718, -75.6144164",
  });

  assert.doesNotMatch(message, /6\.1452718|-75\.6144164|Ubicacion compartida:/i);
  assert.match(message, /nombre completo/i);
});

test("la confirmacion nunca expone coordenadas como direccion de facturacion", () => {
  const message = buildOrderSummaryText(buildDraft({
    fulfillmentType: "pickup",
    billing: {
      type: "normal",
      fullName: "Cliente Demo",
      billingAddress: "Ubicacion compartida: 6.1452718, -75.6144164",
    },
  }), "transfer");

  assert.doesNotMatch(message, /6\.1452718|-75\.6144164|Ubicacion compartida:/i);
});

test("explica el avance porcentual real de cocina", () => {
  const message = buildCustomerOrderStatusMessage({
    status: "preparing",
    fulfillmentType: "delivery",
    kitchenProgress: 50,
  });

  assert.match(message, /en el horno/i);
  assert.match(message, /50%/);
});

test("respeta el nombre personalizado de la etapa de cocina", () => {
  const message = buildCustomerOrderStatusMessage({
    status: "preparing",
    fulfillmentType: "pickup",
    kitchenProgress: 50,
    kitchenStageLabel: "en los sartenes",
  });

  assert.match(message, /en los sartenes/i);
  assert.doesNotMatch(message, /en el horno/i);
});

test("explica mínimo y máximo aunque la opción use tipo single", () => {
  const message = buildProductConfigurationPrompt("Picada armable", {
    id: "protein",
    name: "Proteinas",
    type: "single",
    isRequired: true,
    minSelect: 2,
    maxSelect: 3,
    sortOrder: 0,
    values: [],
  }, { invalidValueTexts: ["Proteinas"] });

  assert.match(message, /máximo 3 opciones/i);
  assert.match(message, /entre 2 y 3 opciones/i);
});

test("confirma expresamente cuando una categoría de componentes es opcional", () => {
  const message = buildProductConfigurationPrompt("Bowl", {
    id: "sauces",
    name: "Salsas",
    type: "single",
    isRequired: false,
    minSelect: 0,
    maxSelect: 2,
    sortOrder: 0,
    values: [],
  });

  assert.match(message, /sin salsas/i);
  assert.match(message, /hasta 2 opciones/i);
});
