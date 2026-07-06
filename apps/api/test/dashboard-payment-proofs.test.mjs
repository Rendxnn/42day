import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardRouteSource = readFileSync(new URL("../src/routes/dashboard.ts", import.meta.url), "utf8");

test("la ruta dashboard live expone el endpoint para descargar comprobantes", () => {
  assert.match(
    dashboardRouteSource,
    /dashboardRoutes\.get\(\"\/:tenantSlug\/orders\/:orderId\/payment-proof\"/,
  );
});

test("la ruta dashboard live expone el endpoint para confirmar comprobantes", () => {
  assert.match(
    dashboardRouteSource,
    /dashboardRoutes\.post\(\"\/:tenantSlug\/orders\/:orderId\/payment-proof\/confirm\"/,
  );
});

test("el detalle live del pedido incluye paymentProof en el payload", () => {
  assert.match(
    dashboardRouteSource,
    /const detail: OrderDetail = \{[\s\S]*paymentProof,/,
  );
});
