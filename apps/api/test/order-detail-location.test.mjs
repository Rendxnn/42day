import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const detailRoute = new URL("../src/features/dashboard/routes/orders/detail.ts", import.meta.url);
const ordersView = new URL("../../dashboard/src/orders.tsx", import.meta.url);
const map = new URL("../../dashboard/src/features/configuration/DeliveryCoverageMap.tsx", import.meta.url);
const styles = new URL("../../dashboard/src/styles.css", import.meta.url);
const billingCard = new URL("../../dashboard/src/features/orders/BillingSummaryCard.tsx", import.meta.url);

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

test("el mapa queda contenido debajo de los modales y la vista prioriza items", async () => {
  const [orderSource, styleSource] = await Promise.all([readFile(ordersView, "utf8"), readFile(styles, "utf8")]);
  assert.match(styleSource, /\.delivery-coverage-map\s*\{[\s\S]*isolation:\s*isolate[\s\S]*z-index:\s*0/);
  assert.ok(orderSource.indexOf("Items del pedido") < orderSource.indexOf("DeliveryCoverageDetail"));
  assert.match(orderSource, /grid-cols-1 gap-2/);
  assert.match(orderSource, /text-\[1\.05rem\] leading-7/);
  const detailPanelSource = orderSource.slice(orderSource.indexOf("function OrderDetailPanel"));
  assert.ok(detailPanelSource.indexOf("Reportar agotado") < detailPanelSource.indexOf("Abrir WhatsApp"));
});

test("facturacion no muestra coordenadas y usa una direccion resuelta", async () => {
  const source = await readFile(billingCard, "utf8");
  assert.match(source, /resolvedDeliveryAddress/);
  assert.match(source, /looksLikeCoordinateAddress/);
  assert.match(source, /billingAddress \|\| "-"/);
});

test("el detalle enriquece los items con imagen o emoji de producto", async () => {
  const [detailSource, orderSource] = await Promise.all([readFile(detailRoute, "utf8"), readFile(ordersView, "utf8")]);
  assert.match(detailSource, /select: "id,emoji,image_url"/);
  assert.match(detailSource, /productImageUrl: product\?\.image_url/);
  assert.match(detailSource, /productEmoji: product\?\.emoji/);
  assert.match(orderSource, /function OrderItemVisual/);
  assert.match(orderSource, /item\.productEmoji\?\.trim\(\) \|\| "🍽️"/);
});
