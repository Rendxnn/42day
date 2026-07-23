import assert from "node:assert/strict";
import test from "node:test";
import { extractExplicitConfigurationOptionTexts, isExplicitConfigurationSkip, resolveProductConfiguration } from "../src/features/product-configurator/service.ts";

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

function buildPicada() {
  return {
    id: "picada-menu-item",
    menuId: "menu-1",
    productId: "picada-product",
    isAvailable: true,
    sortOrder: 0,
    product: {
      id: "picada-product",
      name: "Picada armable",
      basePrice: 40000,
      isActive: true,
      productType: "composite",
      options: [
        {
          id: "carbs", name: "Carbohidratos", type: "single", isRequired: true, minSelect: 1, maxSelect: 2, sortOrder: 0,
          values: [
            { id: "plantain", name: "Platano", priceDelta: 0, isActive: true, sortOrder: 0 },
            { id: "potato", name: "Papa al horno", priceDelta: 0, isActive: true, sortOrder: 1 },
          ],
        },
        {
          id: "proteins", name: "Proteinas", type: "single", isRequired: true, minSelect: 2, maxSelect: 3, sortOrder: 1,
          values: [
            { id: "beef", name: "Res", priceDelta: 0, isActive: true, sortOrder: 0 },
            { id: "pork", name: "Bondiola", priceDelta: 0, isActive: true, sortOrder: 1 },
            { id: "pork-rind", name: "Chicharron ahumado", priceDelta: 0, isActive: true, sortOrder: 2 },
            { id: "ribs", name: "Costillas", priceDelta: 0, isActive: true, sortOrder: 3 },
          ],
        },
        {
          id: "sauces", name: "Salsas", type: "single", isRequired: true, minSelect: 1, maxSelect: 2, sortOrder: 2,
          values: [
            { id: "honey", name: "Miel", priceDelta: 0, isActive: true, sortOrder: 0 },
            { id: "guacamole", name: "Guacamalo", priceDelta: 0, isActive: true, sortOrder: 1 },
          ],
        },
      ],
    },
  };
}

test("mantiene el grupo de proteínas pendiente cuando excede su máximo", () => {
  const resolution = resolveProductConfiguration({
    menuItem: buildPicada(),
    source: "guided",
    rawOptionTexts: [
      { groupText: "Carbohidratos", valueText: "Platano" },
      { groupText: "Proteinas", valueText: "Res" },
      { groupText: "Proteinas", valueText: "Bondiola" },
      { groupText: "Proteinas", valueText: "Chicharron ahumado" },
      { groupText: "Proteinas", valueText: "Costillas" },
    ],
  });

  assert.equal(resolution.status, "needs_clarification");
  assert.equal(resolution.nextOption?.name, "Proteinas");
  assert.deepEqual(resolution.invalidValueTexts, ["Proteinas"]);
});

test("extrae todos los componentes nombrados de una picada en un solo mensaje", () => {
  const choices = extractExplicitConfigurationOptionTexts(
    buildPicada(),
    "una picada con platano, papa al horno, res, bondiola, chicharron ahumado y miel",
  );

  assert.deepEqual(choices, [
    { groupText: "Carbohidratos", valueText: "Platano" },
    { groupText: "Carbohidratos", valueText: "Papa al horno" },
    { groupText: "Proteinas", valueText: "Res" },
    { groupText: "Proteinas", valueText: "Bondiola" },
    { groupText: "Proteinas", valueText: "Chicharron ahumado" },
    { groupText: "Salsas", valueText: "Miel" },
  ]);
});

test("pide confirmación para categorías opcionales y acepta un descarte explícito", () => {
  const menuItem = buildMenuItem();
  menuItem.product.options[1].isRequired = false;
  menuItem.product.options[1].minSelect = 0;
  const option = menuItem.product.options[1];
  const first = resolveProductConfiguration({ menuItem, source: "guided", rawOptionTexts: [{ valueText: "pollo" }] });

  assert.equal(first.status, "needs_clarification");
  assert.equal(first.nextOption?.name, "Salsa");
  assert.equal(isExplicitConfigurationSkip(option, "sin salsas"), true);

  const skipped = resolveProductConfiguration({
    menuItem,
    source: "guided",
    existingResolvedOptions: first.resolvedOptions,
    skippedOptionIds: [option.id],
  });
  assert.equal(skipped.status, "resolved");
});
