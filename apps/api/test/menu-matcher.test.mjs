import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveMenuSelectionsFromText } from "../src/features/menu/matcher.ts";

const semanticOrderSource = readFileSync(
  new URL("../src/features/chat-routing/semantic/order.ts", import.meta.url),
  "utf8",
);

function buildMenu() {
  return {
    tenantSlug: "demo",
    tenantSchema: "tenant_demo",
    items: [
      {
        id: "carne-plancha",
        menuId: "menu-demo",
        displayName: "Carnes a la plancha",
        isAvailable: true,
        sortOrder: 1,
      },
      {
        id: "jugo-fresa",
        menuId: "menu-demo",
        displayName: "Jugo Fresa 16 Oz",
        aliases: ["jugo de fresa", "jugo fresa"],
        isAvailable: true,
        sortOrder: 2,
      },
    ],
    products: [],
  };
}

test("separa plato y bebida cuando el cliente los une con 'con'", () => {
  const selections = resolveMenuSelectionsFromText(
    buildMenu(),
    "quiero 2 almuerzos de carnes a la plancha de res con jugos de fresa porfa",
  );

  assert.deepEqual(
    selections.map((selection) => [selection.item.id, selection.quantity]),
    [["carne-plancha", 2], ["jugo-fresa", 1]],
  );
});

test("no duplica un producto que ya se resolvio por segmentos", () => {
  const selections = resolveMenuSelectionsFromText(
    buildMenu(),
    "dos carnes a la plancha y un jugo de fresa",
  );

  assert.deepEqual(
    selections.map((selection) => [selection.item.id, selection.quantity]),
    [["carne-plancha", 2], ["jugo-fresa", 1]],
  );
});

test("una coincidencia clara del cliente reemplaza un ID de producto equivocado del modelo", () => {
  assert.match(semanticOrderSource, /const mentionedMenuItemIds = new Set\(mentions\.map\(\(mention\) => mention\.item\.id\)\)/);
  assert.match(semanticOrderSource, /if \(!operation\.menuItemId \|\| !mentionedMenuItemIds\.has\(operation\.menuItemId\)\) return false/);
  assert.match(semanticOrderSource, /operations\.push\(\{\s*type: "add_product",\s*menuItemId: mention\.item\.id/);
});
