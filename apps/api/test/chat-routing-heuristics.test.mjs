import assert from "node:assert/strict";
import test from "node:test";
import { resolveMenuSelectionFromText, resolveMenuSelectionsFromText } from "../src/features/menu/matcher.ts";
import { detectSignals } from "../src/modules/message-router/signal-detector.ts";

function buildMenu() {
  return {
    items: [
      buildMenuItem("carne", "Carnes a la plancha"),
      buildMenuItem("costillas", "Costillitas BBQ para 2 personas"),
      buildMenuItem("caldo", "Caldo"),
      buildMenuItem("ensalada", "Ensalada de verduras"),
      buildMenuItem("jugo", "Jugo Fresa 16 Oz"),
    ],
  };
}

function buildMenuItem(id, name, aliases = []) {
  return {
    id,
    displayName: name,
    aliases,
    isAvailable: true,
    sortOrder: 0,
    product: {
      id: `product-${id}`,
      name,
      aliases,
      isActive: true,
    },
  };
}

test("activa semantic parser para pedidos libres en varias lineas aunque no usen verbos esperados", () => {
  const signals = detectSignals({
    message: {
      type: "text",
      text: "para pedirte porfa:\nuna carne a la plancha\n2 costillitas\n1 caldo\n3 ensaladas de verduras\n6 jugos de fresa",
    },
    state: "awaiting_guided_item_selection",
  });

  assert.equal(signals.shouldTrySemanticOrder, true);
});

test("no hace match deterministico de un solo item cuando el texto contiene un pedido compuesto", () => {
  const selection = resolveMenuSelectionFromText(
    buildMenu(),
    "para pedirte porfa:\nuna carne a la plancha\n2 costillitas\n1 caldo\n3 ensaladas de verduras\n6 jugos de fresa",
  );

  assert.equal(selection, null);
});

test("mantiene el match deterministico para un item simple", () => {
  const selection = resolveMenuSelectionFromText(buildMenu(), "2 caldos");

  assert.ok(selection);
  assert.equal(selection?.item.displayName, "Caldo");
  assert.equal(selection?.quantity, 2);
});

test("resuelve follow-up simple de adicion sin depender del LLM", () => {
  const menu = {
    items: [
      ...buildMenu().items,
      buildMenuItem("queso", "Queso 4Oz", ["adiciones de queso", "queso"]),
    ],
  };

  const selections = resolveMenuSelectionsFromText(menu, "y 4 adiciones de queso por favor");

  assert.equal(selections.length, 1);
  assert.equal(selections[0]?.item.displayName, "Queso 4Oz");
  assert.equal(selections[0]?.quantity, 4);
});
