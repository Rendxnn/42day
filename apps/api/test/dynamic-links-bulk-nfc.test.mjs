import assert from "node:assert/strict";
import test from "node:test";
import app from "../src/index.ts";

const env = {
  APP_ENV: "test",
  APP_BASE_URL: "https://staging.parahoy.thaledon.com",
  DYNAMIC_LINK_BASE_URL: "https://go-staging.thaledon.com",
  DASHBOARD_ALLOWED_ORIGINS: "https://staging.parahoy.thaledon.com",
  META_VERIFY_TOKEN: "test", META_ACCESS_TOKEN: "test", META_PHONE_NUMBER_ID: "test", META_WABA_ID: "test",
  SUPABASE_URL: "https://supabase.test", SUPABASE_ANON_KEY: "test", SUPABASE_SERVICE_ROLE_KEY: "test",
};
const actor = "33333333-3333-4333-8333-333333333333";
const unitId = "66666666-6666-4666-8666-666666666666";
const profileId = "11111111-1111-4111-8111-111111111111";
const unit = { id: unitId, public_code: "000000000991", label: "QR", status: "available", revision: 1, destination_type: null, destination_url: null, profile_id: null, created_at: "2026-09-22T00:00:00Z", updated_at: "2026-09-22T00:00:00Z" };

test("quick setup crea/asigna el perfil sin aceptar una URL pública del cliente", async () => {
  const previousFetch = globalThis.fetch;
  let rpcBody;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("auth/v1/user")) return json({ id: actor, app_metadata: { system_admin: true } });
    if (url.includes("dynamic_link_units") && url.includes("id=eq.")) return json([unit]);
    if (url.includes("rpc/quick_configure_dynamic_link_with_profile")) {
      rpcBody = JSON.parse(init.body);
      return json({ unit: { ...unit, status: "active", revision: 2, destination_type: "profile", destination_url: "https://staging.parahoy.thaledon.com/p/cafe", profile_id: profileId } });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const response = await app.request(`https://api.test/dashboard/admin/dynamic-links/${unitId}/quick-configuration`, {
      method: "PATCH", headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      body: JSON.stringify({ revision: 1, label: "QR café", target: { kind: "profile", creationRequestId: "22222222-2222-4222-8222-222222222222", displayName: "Café", slug: "cafe", links: [] } }),
    }, env);
    assert.equal(response.status, 200);
    assert.equal(rpcBody.p_public_base_url, env.APP_BASE_URL);
    assert.equal(rpcBody.p_profile.display_name, "Café");
    assert.equal(rpcBody.p_profile.destination_url, undefined);
  } finally { globalThis.fetch = previousFetch; }
});

test("quick setup devuelve un mensaje controlado para un teléfono inválido", async () => {
  const previousFetch = globalThis.fetch;
  let rpcCalled = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("auth/v1/user")) return json({ id: actor, app_metadata: { system_admin: true } });
    if (url.includes("dynamic_link_units") && url.includes("id=eq.")) return json([unit]);
    if (url.includes("rpc/quick_configure_dynamic_link_with_profile")) {
      rpcCalled = true;
      return json({});
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const response = await app.request(`https://api.test/dashboard/admin/dynamic-links/${unitId}/quick-configuration`, {
      method: "PATCH", headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      body: JSON.stringify({ revision: 1, label: "QR café", target: { kind: "profile", creationRequestId: "22222222-2222-4222-8222-222222222222", displayName: "Café", slug: "cafe", links: [{ kind: "phone", href: "abc", enabled: true }] } }),
    }, env);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, "business_profile_phone_invalid");
    assert.match(body.message, /teléfono/i);
    assert.equal(rpcCalled, false);
  } finally { globalThis.fetch = previousFetch; }
});

test("bulk preflight separa unidades activas protegidas", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("auth/v1/user")) return json({ id: actor, app_metadata: { system_admin: true } });
    if (url.includes("dynamic_link_units") && url.includes("id=in.")) return json([{ ...unit, status: "active", revision: 4 }]);
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const response = await app.request("https://api.test/dashboard/admin/dynamic-links/bulk-configuration/preflight", {
      method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      body: JSON.stringify({ units: [{ id: unitId, revision: 4 }, { id: "77777777-7777-4777-8777-777777777777", revision: 1 }], target: { kind: "profile", profileId } }),
    }, env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.protected.length, 1);
    assert.equal(body.excluded.length, 1);
  } finally { globalThis.fetch = previousFetch; }
});

test("NFC handoff devuelve deep link sin bearer y consume una sola sesión", async () => {
  const previousFetch = globalThis.fetch;
  let handoffRpc = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("auth/v1/user")) return json({ id: actor, app_metadata: { system_admin: true } });
    if (url.includes("dynamic_link_units") && url.includes("id=eq.")) return json([{ ...unit, status: "active", destination_type: "website", destination_url: "https://example.com" }]);
    if (url.includes("rpc/create_nfc_handoff_session")) { handoffRpc += 1; return json({ id: "88888888-8888-4888-8888-888888888888" }); }
    if (url.includes("rpc/consume_nfc_handoff_session")) return json({ sessionId: "88888888-8888-4888-8888-888888888888", unitId, reportedUid: "04A1" });
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const created = await app.request(`https://api.test/dashboard/admin/dynamic-links/${unitId}/nfc-handoff`, { method: "POST", headers: { Authorization: "Bearer test" } }, env);
    assert.equal(created.status, 200);
    const payload = await created.json();
    assert.match(payload.handoffUrl, /^nfchelper:\/\/write\?/);
    assert.equal(payload.handoffUrl.includes(payload.token), false);
    assert.equal(handoffRpc, 1);
    const consumed = await app.request("https://api.test/dashboard/admin/nfc-handoff/88888888-8888-4888-8888-888888888888/consume", { method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ token: payload.token, reportedUid: "04A1" }) }, env);
    assert.equal(consumed.status, 200);
  } finally { globalThis.fetch = previousFetch; }
});

function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } }); }
