import assert from "node:assert/strict";
import test from "node:test";
import {
  DeliveryCoverageConfigurationError,
  evaluateDeliveryCoverage,
  getDeliveryCoverageSettings,
  haversineDistanceKm,
  parseDeliveryCoverageSettingsUpdate,
} from "../src/features/delivery-coverage/service.ts";

const baseSettings = {
  locationId: "location-1",
  deliveryEnabled: true,
  latitude: 6.2442,
  longitude: -75.5812,
  restaurantCountry: "Colombia",
  deliveryRadiusKm: 3,
  allowWrittenAddressReference: true,
  tryGeocodeWrittenAddresses: false,
  allowOutOfCoverageOrders: false,
  requestLocationMessage: "Envia tu ubicacion actual por WhatsApp para validar cobertura.",
  writtenAddressFallbackMessage: "Guardamos tu direccion como referencia, pero necesitamos tu ubicacion exacta.",
  outOfCoverageMessage: "No tenemos cobertura para esta ubicacion. Puedes recoger en el local.",
};

test("calcula distancia Haversine en kilometros", () => {
  const distance = haversineDistanceKm(6.2442, -75.5812, 6.2518, -75.5636);
  assert.ok(distance > 2 && distance < 2.3);
});

test("acepta una ubicacion de WhatsApp dentro del radio", () => {
  const result = evaluateDeliveryCoverage(baseSettings, 6.2518, -75.5636);
  assert.equal(result.isInsideCoverage, true);
  assert.equal(result.validationMethod, "whatsapp_location");
  assert.equal(result.confidence, "high");
});

test("rechaza una ubicacion de WhatsApp fuera del radio", () => {
  const result = evaluateDeliveryCoverage(baseSettings, 6.3044, -75.5724);
  assert.equal(result.isInsideCoverage, false);
  assert.ok(result.distanceKm > result.deliveryRadiusKm);
});

test("falla si el restaurante no tiene coordenadas", () => {
  assert.throws(
    () => evaluateDeliveryCoverage({ ...baseSettings, latitude: undefined, longitude: undefined }, 6.25, -75.57),
    (error) => error instanceof DeliveryCoverageConfigurationError && error.code === "restaurant_location_missing",
  );
});

test("falla si los domicilios estan desactivados", () => {
  assert.throws(
    () => evaluateDeliveryCoverage({ ...baseSettings, deliveryEnabled: false }, 6.25, -75.57),
    (error) => error instanceof DeliveryCoverageConfigurationError && error.code === "delivery_disabled",
  );
});

test("valida coordenadas y radio al guardar configuracion", () => {
  assert.equal(parseDeliveryCoverageSettingsUpdate({ ...baseSettings, deliveryRadiusKm: 31 }), undefined);
  assert.equal(parseDeliveryCoverageSettingsUpdate({ ...baseSettings, latitude: 91 }), undefined);
  assert.equal(parseDeliveryCoverageSettingsUpdate({ ...baseSettings, longitude: -181 }), undefined);
  assert.equal(parseDeliveryCoverageSettingsUpdate({ ...baseSettings, longitude: undefined }), undefined);
  assert.equal(parseDeliveryCoverageSettingsUpdate({ ...baseSettings, requestLocationMessage: "corto" }), undefined);
  assert.ok(parseDeliveryCoverageSettingsUpdate({ ...baseSettings, deliveryRadiusKm: 4.5 }));
});

test("permite guardar la configuracion sin ubicacion mientras se completa", () => {
  const parsed = parseDeliveryCoverageSettingsUpdate({
    ...baseSettings,
    latitude: undefined,
    longitude: undefined,
  });

  assert.ok(parsed);
  assert.equal(parsed.latitude, undefined);
  assert.equal(parsed.longitude, undefined);
});

test("usa query legacy cuando faltan columnas nuevas en locations", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push(String(url));

    if (calls.length === 1) {
      return new Response('{"code":"PGRST204","message":"Could not find the column \\"restaurant_city\\" of \\"locations\\" in the schema cache"}', {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify([{
      id: "location-legacy",
      delivery_enabled: true,
      latitude: 6.2442,
      longitude: -75.5812,
    }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const settings = await getDeliveryCoverageSettings({
      env: {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "test-key",
      },
      schemaName: "tenant_demo",
    });

    assert.equal(calls.length, 2);
    assert.match(calls[0], /restaurant_city/);
    assert.match(calls[1], /select=id%2Cdelivery_enabled%2Clatitude%2Clongitude/);
    assert.equal(settings?.locationId, "location-legacy");
    assert.equal(settings?.deliveryRadiusKm, 3);
    assert.equal(settings?.restaurantCountry, "Colombia");
    assert.equal(settings?.allowWrittenAddressReference, true);
    assert.equal(settings?.tryGeocodeWrittenAddresses, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
