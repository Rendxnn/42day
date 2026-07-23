import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const catalogRoute = readFileSync(new URL("../src/features/dashboard/routes/catalog.ts", import.meta.url), "utf8");
const menuService = readFileSync(new URL("../src/features/menu/service.ts", import.meta.url), "utf8");
const menuRepository = readFileSync(new URL("../src/features/menu/repository.ts", import.meta.url), "utf8");
const dashboardMenuRoute = readFileSync(new URL("../src/features/dashboard/routes/menu.ts", import.meta.url), "utf8");
const publicCartaRoute = readFileSync(new URL("../src/features/dashboard/routes/public-carta.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../../supabase/migrations/20260723173447_enforce_catalog_menu_integrity.sql", import.meta.url), "utf8");
const softDeleteMigration = readFileSync(new URL("../../../supabase/migrations/20260723181511_soft_delete_menu_items.sql", import.meta.url), "utf8");

test("desactivar un producto del catálogo retira sus entradas del menú disponible en la misma transacción", () => {
  assert.match(catalogRoute, /is_active:\s*false/);
  assert.match(migration, /after update of is_active on %I\.products/i);
  assert.match(migration, /update %I\.menu_items set is_available = false where product_id = \$1/i);
  assert.match(migration, /where mi\.product_id = p\.id[\s\S]*p\.is_active is not true/i);
});

test("la base rechaza agregar al menú un producto inactivo", () => {
  assert.match(migration, /before insert or update of product_id on %I\.menu_items/i);
  assert.match(migration, /menu_item_product_must_be_active/);
});

test("las lecturas públicas y del bot no exponen referencias de catálogo inactivas", () => {
  for (const source of [menuService, dashboardMenuRoute, publicCartaRoute]) {
    assert.match(source, /!item\.product_?id \|\| productById\.has\(item\.product_?id\)/);
  }
});

test("eliminar un plato del menú es lógico, persistente y distinto de pausarlo", () => {
  assert.match(menuRepository, /removed_at:\s*"is\.null"/);
  assert.match(dashboardMenuRoute, /removed_at:\s*"is\.null"/);
  assert.match(publicCartaRoute, /removed_at:\s*"is\.null"/);
  assert.match(dashboardMenuRoute, /table:\s*"menu_items"[\s\S]*patch:\s*\{[\s\S]*removed_at:\s*new Date\(\)\.toISOString\(\)/);
  assert.match(softDeleteMigration, /add column if not exists removed_at timestamptz/i);
  assert.match(softDeleteMigration, /removed_at = coalesce\(removed_at, now\(\)\)/i);
});
