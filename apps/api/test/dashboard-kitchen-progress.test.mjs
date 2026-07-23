import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(
  new URL("../src/features/dashboard/routes/orders/kitchen-progress.ts", import.meta.url),
  "utf8",
);
const orderSupportSource = readFileSync(
  new URL("../src/features/dashboard/support/orders.ts", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL("../../../supabase/migrations/20260723055100_add_order_kitchen_progress.sql", import.meta.url),
  "utf8",
);

test("el dashboard expone una ruta persistente para el progreso de cocina", () => {
  assert.match(routeSource, /orders\/:orderId\/kitchen-progress/);
  assert.match(routeSource, /KITCHEN_MILESTONES/);
  assert.match(routeSource, /order_payment_not_confirmed/);
});

test("la migración limita el progreso a los cinco hitos operativos", () => {
  assert.match(migrationSource, /kitchen_progress in \(0, 25, 50, 75, 100\)/);
  assert.match(migrationSource, /tenant_template/);
  assert.match(migrationSource, /kitchen_stage_label/);
});

test("las transiciones de estado cargan el progreso de cocina persistido", () => {
  assert.match(orderSupportSource, /import \{ ORDER_SELECT \} from "\.\.\/routes\/orders\/contracts\.ts"/);
  assert.match(orderSupportSource, /select: ORDER_SELECT/);
});
