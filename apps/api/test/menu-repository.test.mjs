import assert from "node:assert/strict";
import test from "node:test";
import { selectActiveLocation } from "../src/features/menu/repository.ts";

test("usa query legacy para cargar la ubicacion activa cuando faltan columnas nuevas", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url) => {
    calls.push(String(url));

    if (calls.length === 1) {
      return new Response('{"code":"PGRST204","message":"Could not find the column \\"restaurant_city\\" of \\"locations\\" in the schema cache"}', {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify([{
      id: "location-legacy",
      name: "Sede principal",
      address: "Cra 1 # 2-3",
      phone: "3001234567",
      delivery_fee_fixed: 5000,
      delivery_enabled: true,
      latitude: 6.2442,
      longitude: -75.5812,
      is_active: true,
    }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const location = await selectActiveLocation({
      env: {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "test-key",
      },
      schemaName: "tenant_demo",
    });

    assert.equal(calls.length, 2);
    assert.match(calls[0], /restaurant_city/);
    assert.match(calls[1], /select=id%2Cname%2Caddress%2Cphone%2Cdelivery_fee_fixed%2Cdelivery_enabled%2Clatitude%2Clongitude%2Cis_active/);
    assert.equal(location?.id, "location-legacy");
    assert.equal(location?.name, "Sede principal");
    assert.equal(location?.delivery_fee_fixed, 5000);
    assert.equal(location?.delivery_enabled, true);
    assert.equal(location?.pickup_enabled, undefined);
    assert.equal(location?.automation_enabled, undefined);
    assert.equal(location?.restaurant_city, undefined);
    assert.equal(location?.delivery_radius_km, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
