import assert from "node:assert/strict";
import test from "node:test";
import { consolidateOrderLineItems } from "../src/features/draft-orders/consolidation.ts";

test("consolida productos identicos sumando cantidad y total", () => {
  const items = consolidateOrderLineItems([
    { id: "line-1", menuItemId: "papas", productId: "product-papas", name: "Papas a la francesa", quantity: 1, unitPrice: 3000, lineTotal: 3000 },
    { id: "line-2", menuItemId: "papas", productId: "product-papas", name: "Papas a la francesa", quantity: 1, unitPrice: 3000, lineTotal: 3000 },
    { id: "line-3", menuItemId: "papas", productId: "product-papas", name: "Papas a la francesa", quantity: 1, unitPrice: 3000, lineTotal: 3000 },
  ]);

  assert.deepEqual(items, [{
    id: "line-1",
    menuItemId: "papas",
    productId: "product-papas",
    name: "Papas a la francesa",
    quantity: 3,
    unitPrice: 3000,
    lineTotal: 9000,
  }]);
});

test("conserva lineas separadas cuando cambian notas u opciones", () => {
  const items = consolidateOrderLineItems([
    { menuItemId: "burger", name: "Hamburguesa", quantity: 1, unitPrice: 20000, notes: "sin cebolla", lineTotal: 20000 },
    { menuItemId: "burger", name: "Hamburguesa", quantity: 1, unitPrice: 20000, notes: "con cebolla", lineTotal: 20000 },
    {
      menuItemId: "burger",
      name: "Hamburguesa",
      quantity: 1,
      unitPrice: 22000,
      options: {
        mode: "resolved",
        source: "semantic",
        resolvedOptions: [{
          optionId: "cheese",
          optionName: "Queso",
          optionType: "single",
          selectedValues: [{ valueId: "double", valueName: "Doble", priceDelta: 2000 }],
          priceDelta: 2000,
        }],
      },
      lineTotal: 22000,
    },
  ]);

  assert.equal(items.length, 3);
});

test("consolida la misma configuracion aunque venga de flujos distintos", () => {
  const resolvedOptions = [{
    optionId: "protein",
    optionName: "Proteína",
    optionType: "single",
    selectedValues: [{ valueId: "beef", valueName: "Res", priceDelta: 0 }],
    priceDelta: 0,
  }];
  const pricing = { unitBasePrice: 18000, optionsPriceDelta: 0, resolvedUnitPrice: 18000 };
  const items = consolidateOrderLineItems([
    {
      menuItemId: "lunch",
      name: "Almuercito del día",
      quantity: 1,
      unitPrice: 18000,
      options: { mode: "resolved", source: "guided", resolvedOptions, pricing },
      lineTotal: 18000,
    },
    {
      menuItemId: "lunch",
      name: "Almuercito del día",
      quantity: 1,
      unitPrice: 18000,
      options: {
        mode: "resolved",
        source: "semantic",
        rawOptionTexts: [{ groupText: "Proteína", valueText: "carne de res" }],
        resolvedOptions,
        pricing,
      },
      lineTotal: 18000,
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 2);
  assert.equal(items[0].lineTotal, 36000);
});
