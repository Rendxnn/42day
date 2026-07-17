import assert from "node:assert/strict";
import test from "node:test";
import {
  DeliveryCoverageConfigurationError,
  evaluateDeliveryCoverage,
  getDeliveryCoverageSettings,
  hasValidatedDeliveryCoverage,
  haversineDistanceKm,
  parseDeliveryCoverageSettingsUpdate,
  validateDeliveryCoverageFromWrittenAddress,
} from "../src/features/delivery-coverage/service.ts";
import { reverseGeocodeCoordinatesWithGoogleMaps } from "../src/features/delivery-coverage/google-maps.ts";
import { segmentDeliveryAddress } from "../src/features/delivery-coverage/address-text.ts";

const baseSettings = {
  locationId: "location-1",
  deliveryEnabled: true,
  deliveryFeeFixed: 4_000,
  electronicBillingEnabled: true,
  latitude: 6.2442,
  longitude: -75.5812,
  restaurantCountry: "Colombia",
  deliveryRadiusKm: 3,
  allowWrittenAddressReference: true,
  tryGeocodeWrittenAddresses: true,
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

test("acepta cobertura validada por direccion geocodificada", () => {
  assert.equal(hasValidatedDeliveryCoverage({
    coverageValidationMethod: "geocoded_address",
    isInsideDeliveryCoverage: true,
  }), true);

  assert.equal(hasValidatedDeliveryCoverage({
    coverageValidationMethod: "written_address_reference",
    isInsideDeliveryCoverage: true,
  }), false);
});

test("separa las indicaciones del domiciliario de la direccion que se geocodifica", () => {
  assert.deepEqual(
    segmentDeliveryAddress({ addressText: "Calle 74 Sur #35-145, Sabaneta, Torre 2, apto 301, portería" }),
    {
      addressText: "Calle 74 Sur #35-145, Sabaneta",
      details: "Torre 2, apto 301, portería",
    },
  );
});

test("prioriza los detalles separados por la IA sin alterar la direccion", () => {
  assert.deepEqual(
    segmentDeliveryAddress({
      addressText: "Carrera 43A # 61 Sur-44, Sabaneta",
      details: "Unidad Los Pinos, casa 12; avisar en portería",
    }),
    {
      addressText: "Carrera 43A # 61 Sur-44, Sabaneta",
      details: "Unidad Los Pinos, casa 12; avisar en portería",
    },
  );
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
  assert.equal(parseDeliveryCoverageSettingsUpdate({ ...baseSettings, deliveryFeeFixed: -1 }), undefined);
  assert.equal(parseDeliveryCoverageSettingsUpdate({ ...baseSettings, electronicBillingEnabled: "true" }), undefined);
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
    assert.equal(settings?.deliveryFeeFixed, 0);
    assert.equal(settings?.electronicBillingEnabled, true);
    assert.equal(settings?.restaurantCountry, "Colombia");
    assert.equal(settings?.allowWrittenAddressReference, true);
    assert.equal(settings?.tryGeocodeWrittenAddresses, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("no geocodifica direcciones escritas cuando el restaurante lo desactiva", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify([{
      id: "location-1",
      delivery_enabled: true,
      latitude: 6.2442,
      longitude: -75.5812,
      delivery_radius_km: 3,
      try_geocode_written_addresses: false,
    }]), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const result = await validateDeliveryCoverageFromWrittenAddress({
      env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key", GOOGLE_MAPS_GEOCODING_API_KEY: "google-key" },
      schemaName: "tenant_demo",
      addressText: "Calle 74 Sur #35-145, Sabaneta",
    });
    assert.equal(result, null);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resuelve y devuelve una direccion legible para una ubicacion compartida", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({
      status: "OK",
      results: [{
        formatted_address: "Carrera 43A # 61 Sur-44, Sabaneta, Antioquia, Colombia",
        geometry: { location: { lat: 6.1512, lng: -75.6167 }, location_type: "ROOFTOP" },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const address = await reverseGeocodeCoordinatesWithGoogleMaps({
      env: { GOOGLE_MAPS_GEOCODING_API_KEY: "google-key" },
      latitude: 6.1512,
      longitude: -75.6167,
    });
    assert.equal(address, "Carrera 43A # 61 Sur-44, Sabaneta, Antioquia, Colombia");
    assert.match(requestedUrl, /latlng=6.1512%2C-75.6167/);
    assert.doesNotMatch(requestedUrl, /address=/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
