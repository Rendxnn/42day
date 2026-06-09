import assert from "node:assert/strict";
import test from "node:test";
import { resolveProductConfiguration } from "../src/features/product-configurator/service.ts";

function buildMenuItem() {
  return {
    id: "menu-item-1",
    menuId: "menu-1",
    productId: "product-1",
    isAvailable: true,
    sortOrder: 0,
    product: {
      id: "product-1",
      name: "Bowl personalizado",
      basePrice: 20000,
      isActive: true,
      productType: "composite",
      options: [
        {
          id: "option-protein",
          code: "protein",
          name: "Proteina",
          type: "single",
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          sortOrder: 0,
          values: [
            {
              id: "protein-chicken",
              code: "chicken",
              name: "Pollo",
              aliases: ["pechuga"],
              priceDelta: 0,
              isActive: true,
              sortOrder: 0,
            },
            {
              id: "protein-steak",
              code: "steak",
              name: "Carne",
              priceDelta: 3000,
              isActive: true,
              sortOrder: 1,
            },
          ],
        },
        {
          id: "option-sauce",
          code: "sauce",
          name: "Salsa",
          type: "single",
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          sortOrder: 1,
          values: [
            {
              id: "sauce-teriyaki",
              code: "teriyaki",
              name: "Teriyaki",
              priceDelta: 0,
              isActive: true,
              sortOrder: 0,
            },
            {
              id: "sauce-bbq",
              code: "bbq",
              name: "BBQ",
              priceDelta: 0,
              isActive: true,
              sortOrder: 1,
            },
          ],
        },
      ],
    },
  };
}

test("resuelve configurables requeridos y suma priceDelta", () => {
  const resolution = resolveProductConfiguration({
    menuItem: buildMenuItem(),
    source: "semantic",
    rawOptionTexts: [
      { valueText: "pechuga" },
      { groupText: "Salsa", valueText: "bbq" },
    ],
  });

  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.resolvedOptions.length, 2);
  assert.equal(resolution.pricing.unitBasePrice, 20000);
  assert.equal(resolution.pricing.optionsPriceDelta, 0);
  assert.equal(resolution.pricing.resolvedUnitPrice, 20000);
  assert.deepEqual(
    resolution.resolvedOptions.map((option) => option.optionName),
    ["Proteina", "Salsa"],
  );
});

test("pide aclaracion cuando falta un configurable requerido", () => {
  const resolution = resolveProductConfiguration({
    menuItem: buildMenuItem(),
    source: "guided",
    rawOptionTexts: [{ valueText: "pollo" }],
  });

  assert.equal(resolution.status, "needs_clarification");
  assert.equal(resolution.nextOption?.name, "Salsa");
  assert.deepEqual(
    resolution.missingRequiredOptions.map((option) => option.name),
    ["Salsa"],
  );
});

test("marca ambiguedad cuando un valor puede caer en mas de una opcion", () => {
  const menuItem = buildMenuItem();
  menuItem.product.options.push({
    id: "option-size",
    code: "size",
    name: "Tamano",
    type: "single",
    isRequired: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 2,
    values: [
      {
        id: "size-bbq",
        name: "BBQ",
        priceDelta: 0,
        isActive: true,
        sortOrder: 0,
      },
    ],
  });

  const resolution = resolveProductConfiguration({
    menuItem,
    source: "semantic",
    rawOptionTexts: [{ valueText: "bbq" }],
  });

  assert.equal(resolution.status, "needs_clarification");
  assert.deepEqual(resolution.ambiguousValueTexts, ["bbq"]);
});
