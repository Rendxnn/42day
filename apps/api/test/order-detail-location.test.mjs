import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const detailRoute = new URL("../src/features/dashboard/routes/orders/detail.ts", import.meta.url);
const ordersView = new URL("../../dashboard/src/orders.tsx", import.meta.url);
const map = new URL("../../dashboard/src/features/configuration/DeliveryCoverageMap.tsx", import.meta.url);

test("el detalle resuelve la ubicacion del restaurante desde locationId de la orden", async () => {
  const source = await readFile(detailRoute, "utf8");
  assert.match(source, /id: `eq\.\$\{order\.location_id\}`/);
  assert.match(source, /restaurantLocation:/);
  assert.match(source, /delivery_radius_km/);
});

test("el detalle muestra mapa solo con ambas ubicaciones y nunca imprime coordenadas", async () => {
  const source = await readFile(ordersView, "utf8");
  assert.match(source, /const canShowMap = hasExactLocation && restaurantLocation !== undefined/);
  assert.match(source, /customerLatitude=\{customerLatitude\}/);
  assert.match(source, /customerLongitude=\{customerLongitude\}/);
  assert.doesNotMatch(source, /label=\{locale === "en" \? "Coordinates"/);
});

test("el mapa reutilizado diferencia cliente y restaurante y ajusta ambos puntos", async () => {
  const source = await readFile(map, "utf8");
  assert.match(source, /parahoy-map-pin--customer/);
  assert.match(source, /L\.latLngBounds\(\[center, customerPosition\]\)/);
  assert.match(source, /draggableMarker = true/);
});
