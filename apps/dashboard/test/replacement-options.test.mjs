import assert from "node:assert/strict";
import test from "node:test";
import { buildReplacementPools, resolveOrderItemCategory } from "../src/features/orders/replacement-options.ts";

function menuItem({
  id,
  productId,
  name,
  category,
  isAvailable = true,
  isActive = true,
  sortOrder = 0,
}) {
  return {
    id,
    menuId: "menu-today",
    productId,
    displayName: name,
    isAvailable,
    sortOrder,
    product: {
      id: productId,
      name,
      basePrice: 20_000,
      category,
      isActive,
    },
  };
}

test("prioritizes currently visible products from the same category", () => {
  const currentItem = menuItem({
    id: "argentina-item",
    productId: "argentina-product",
    name: "Hamburguesa argentina",
    category: "Hamburguesas",
  });
  const classic = menuItem({
    id: "classic-item",
    productId: "classic-product",
    name: "Hamburguesa clásica",
    category: "Hamburguesa",
    sortOrder: 1,
  });
  const tropical = menuItem({
    id: "tropical-item",
    productId: "tropical-product",
    name: "Hamburguesa tropical",
    category: "Hamburguesas",
    sortOrder: 2,
  });
  const hiddenPicada = menuItem({
    id: "picada-item",
    productId: "picada-product",
    name: "Picada armable",
    category: "Platos fuertes",
    isAvailable: false,
  });
  const visibleDrink = menuItem({
    id: "drink-item",
    productId: "drink-product",
    name: "Limonada",
    category: "Bebidas",
    sortOrder: 3,
  });
  const orderItem = {
    menuItemId: currentItem.id,
    productId: currentItem.productId,
    name: currentItem.displayName,
    quantity: 2,
    unitPrice: 20_000,
    lineTotal: 40_000,
  };

  const pools = buildReplacementPools(
    [currentItem, classic, tropical, hiddenPicada, visibleDrink],
    orderItem,
  );

  assert.deepEqual(pools.same.map((item) => item.id), ["classic-item", "tropical-item"]);
  assert.deepEqual(pools.other.map((item) => item.id), ["drink-item"]);
  assert.equal(resolveOrderItemCategory(orderItem, [currentItem]), "Hamburguesas");
});

test("uses the order snapshot even when the original menu item is no longer visible", () => {
  const alternative = menuItem({
    id: "alternative-item",
    productId: "alternative-product",
    name: "Hamburguesa clásica",
    category: "Hamburguesas",
  });
  const orderItem = {
    categorySnapshot: "Hamburguesas",
    menuItemId: "removed-item",
    productId: "removed-product",
    name: "Hamburguesa argentina",
    quantity: 2,
    unitPrice: 20_000,
    lineTotal: 40_000,
  };

  const pools = buildReplacementPools([alternative], orderItem);

  assert.deepEqual(pools.same.map((item) => item.id), ["alternative-item"]);
  assert.deepEqual(pools.other, []);
});
