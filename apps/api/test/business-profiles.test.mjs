import assert from "node:assert/strict";
import test from "node:test";
import app from "../src/index.ts";
import { normalizeLinkHref, parseCreateBusinessProfile, parseUpdateBusinessProfile } from "../src/features/public-profile/business-profile-validation.ts";

const env = {
  APP_ENV: "test",
  APP_BASE_URL: "https://parahoy.thaledon.com",
  DYNAMIC_LINK_BASE_URL: "https://go.thaledon.com",
  DASHBOARD_ALLOWED_ORIGINS: "",
  META_VERIFY_TOKEN: "test",
  META_ACCESS_TOKEN: "test",
  META_PHONE_NUMBER_ID: "test",
  META_WABA_ID: "test",
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "test",
  SUPABASE_SERVICE_ROLE_KEY: "test",
};

const profile = {
  id: "11111111-1111-4111-8111-111111111111",
  creation_request_id: "22222222-2222-4222-8222-222222222222",
  slug: "cafe-prueba",
  tenant_id: null,
  display_name: "Café prueba",
  headline: "Café local",
  location_name: "Centro",
  address: "Carrera 1",
  status: "published",
  revision: 2,
  published_at: "2026-09-22T00:00:00Z",
  created_by: "33333333-3333-4333-8333-333333333333",
  created_at: "2026-09-22T00:00:00Z",
  updated_at: "2026-09-22T00:00:00Z",
};

const links = [
  { id: "44444444-4444-4444-8444-444444444444", profile_id: profile.id, kind: "website", label: "Web", href: "https://example.com/", enabled: true, sort_order: 10 },
  { id: "55555555-5555-4555-8555-555555555555", profile_id: profile.id, kind: "instagram", label: "Oculto", href: "https://instagram.com/example", enabled: false, sort_order: 20 },
];

test("profile validation normalizes phone and rejects unsafe links", () => {
  const validPhones = [
    ["phone", "+57 (300) 123 4567", "tel:+573001234567"],
    ["whatsapp", "+57 300 123 4567", "https://wa.me/573001234567"],
    ["phone", "tel:+57-300-123-4567", "tel:+573001234567"],
    ["whatsapp", "https://www.wa.me/573001234567/", "https://wa.me/573001234567"],
    ["whatsapp", "https://api.whatsapp.com/send?phone=573001234567", "https://wa.me/573001234567"],
    ["phone", "300 123 4567", "tel:+3001234567"],
    ["phone", "+1 202.555.0100", "tel:+12025550100"],
    ["phone", "+44 (20) 7946-0958", "tel:+442079460958"],
    ["whatsapp", "  +34 600 123 456  ", "https://wa.me/34600123456"],
    ["phone", "1234567", "tel:+1234567"],
    ["whatsapp", "001 202 555 0100", "https://wa.me/0012025550100"],
    ["phone", "+573001234567", "tel:+573001234567"],
  ];
  for (const [kind, value, expected] of validPhones) assert.equal(normalizeLinkHref(kind, value), expected);
  for (const invalid of ["+57 300 123 4567 ext 9", "abc +57 300 123 4567", "+57 123", "+57 300 123 4567 8901", "tel:", "+57 300 123 4567 x9", "++573001234567", "300/123/4567"]) {
    assert.throws(() => normalizeLinkHref("phone", invalid), (error) => error?.code === "business_profile_phone_invalid");
  }
  assert.throws(() => normalizeLinkHref("website", "http://example.com"), (error) => error?.code === "business_profile_link_href_invalid");
  assert.throws(() => parseCreateBusinessProfile({ requestId: "bad", displayName: "x" }), (error) => error?.code === "business_profile_request_invalid");
  assert.throws(() => parseCreateBusinessProfile({ requestId: "22222222-2222-4222-8222-222222222222", displayName: "x".repeat(161) }), (error) => error?.code === "business_profile_display_name_invalid");
  assert.throws(() => parseUpdateBusinessProfile({ revision: 1, displayName: "x", links: Array.from({ length: 31 }, (_, index) => ({ kind: "website", label: `Web ${index}`, href: "https://example.com", enabled: true })) }), (error) => error?.code === "business_profile_links_invalid");
  assert.equal(parseUpdateBusinessProfile({ revision: 1, displayName: "X", links: [{ kind: "phone", href: "", enabled: false }] }).links.length, 0);
  assert.throws(() => parseUpdateBusinessProfile({ revision: 1, displayName: "X", links: [{ kind: "phone", href: "abc", enabled: true }] }), (error) => error?.code === "business_profile_phone_invalid");
});

test("profile validation errors carry a safe field and user message", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("auth/v1/user")) return jsonResponse({ id: "33333333-3333-4333-8333-333333333333", app_metadata: { system_admin: true } });
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const response = await app.request("https://api.test/dashboard/admin/business-profiles", { method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" }, body: JSON.stringify({ requestId: "22222222-2222-4222-8222-222222222222", displayName: "Café", tenantId: "bad" }) }, env);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, "business_profile_tenant_invalid");
    assert.equal(body.field, "tenantId");
    assert.match(body.message, /negocio seleccionado/i);
    assert.doesNotMatch(body.message, /business_profile_/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("public profile exposes only enabled links and drafts are not public", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("business_profiles") && url.includes("slug=eq.cafe-prueba")) return jsonResponse([profile]);
    if (url.includes("business_profiles") && url.includes("slug=eq.borrador")) return jsonResponse([]);
    if (url.includes("business_profile_links")) return jsonResponse(links);
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const response = await app.request("https://api.test/dashboard/public/p/cafe-prueba", undefined, env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.profile.slug, "cafe-prueba");
  assert.equal(body.links.length, 1);
  assert.equal(body.links[0].kind, "website");

    const draft = await app.request("https://api.test/dashboard/public/p/borrador", undefined, env);
    assert.equal(draft.status, 404);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("admin profile creation is idempotent at the RPC boundary", async () => {
  const previousFetch = globalThis.fetch;
  let rpcCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("auth/v1/user")) return jsonResponse({ id: "33333333-3333-4333-8333-333333333333", app_metadata: { system_admin: true } });
    if (url.includes("rpc/create_business_profile")) {
      rpcCalls += 1;
      assert.equal(JSON.parse(init.body).p_creation_request_id, profile.creation_request_id);
      return jsonResponse({ ...profile, status: "draft", revision: 1 });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const request = { requestId: profile.creation_request_id, slug: "cafe-prueba", displayName: "Café prueba" };
    const response = await app.request("https://api.test/dashboard/admin/business-profiles", { method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" }, body: JSON.stringify(request) }, env);
    assert.equal(response.status, 201);
    assert.equal((await response.json()).profile.slug, "cafe-prueba");
    assert.equal(rpcCalls, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("admin profile inventory validates filters and returns a cursor page", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("auth/v1/user")) return jsonResponse({ id: "33333333-3333-4333-8333-333333333333", app_metadata: { system_admin: true } });
    if (url.includes("rpc/list_business_profiles_page")) {
      const body = JSON.parse(init.body);
      assert.equal(body.p_query, "cafe");
      assert.equal(body.p_page_size, 25);
      return jsonResponse({ profiles: [{ id: profile.id, creationRequestId: profile.creation_request_id, slug: profile.slug, displayName: profile.display_name, status: profile.status, revision: profile.revision, tenantId: null, association: "generic", activeQrCount: 1, createdAt: profile.created_at, updatedAt: profile.updated_at }], totalCount: 251, pageInfo: { hasNext: true, nextCursor: { value: profile.updated_at, id: profile.id } } });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const response = await app.request("https://api.test/dashboard/admin/business-profiles?query=cafe&pageSize=25&sort=updatedAt&direction=desc", { headers: { Authorization: "Bearer test-token" } }, env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.totalCount, 251);
    assert.equal(body.profiles[0].activeQrCount, 1);
    assert.equal(typeof body.pageInfo.nextCursor, "string");

    const invalid = await app.request("https://api.test/dashboard/admin/business-profiles?pageSize=10", { headers: { Authorization: "Bearer test-token" } }, env);
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error, "business_profile_page_size_invalid");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("an admin assigns a published profile without letting the client choose its public URL", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("auth/v1/user")) return jsonResponse({ id: "33333333-3333-4333-8333-333333333333", app_metadata: { system_admin: true } });
    if (url.includes("dynamic_link_units") && url.includes("id=eq.")) return jsonResponse([{ id: "66666666-6666-4666-8666-666666666666", public_code: "000000000991", label: "QR", status: "available", revision: 1, destination_type: null, destination_url: null, profile_id: null, created_at: "2026-09-22T00:00:00Z", updated_at: "2026-09-22T00:00:00Z" }]);
    if (url.includes("business_profiles") && url.includes("id=eq.")) return jsonResponse([profile]);
    if (url.includes("business_profile_links")) return jsonResponse(links);
    if (url.includes("rpc/update_dynamic_link_unit")) {
      const body = JSON.parse(init.body);
      assert.equal(body.p_patch.profile_id, profile.id);
      assert.equal(body.p_patch.destination_url, "https://parahoy.thaledon.com/p/cafe-prueba");
      return jsonResponse({ id: "66666666-6666-4666-8666-666666666666", public_code: "000000000991", label: "QR", status: "active", revision: 2, destination_type: "profile", destination_url: body.p_patch.destination_url, profile_id: profile.id, created_at: "2026-09-22T00:00:00Z", updated_at: "2026-09-22T00:00:00Z" });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const response = await app.request("https://api.test/dashboard/admin/dynamic-links/66666666-6666-4666-8666-666666666666", { method: "PATCH", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" }, body: JSON.stringify({ revision: 1, destinationType: "profile", profileId: profile.id, destinationUrl: "https://attacker.example/ignored" }) }, env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.unit.profileId, profile.id);
    assert.equal(body.unit.destinationUrl, "https://parahoy.thaledon.com/p/cafe-prueba");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
