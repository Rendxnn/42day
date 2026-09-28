import assert from "node:assert/strict";
import test from "node:test";
import app from "../src/index.ts";

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

const admin = { id: "33333333-3333-4333-8333-333333333333", email: "admin@example.com", app_metadata: { system_admin: true } };
const qrId = "66666666-6666-4666-8666-666666666666";

test("MCP resource metadata and tool discovery are protected and explicit", async () => {
  const metadata = await app.request("https://api.test/.well-known/oauth-protected-resource", undefined, env);
  assert.equal(metadata.status, 200);
  assert.deepEqual((await metadata.json()).authorization_servers, ["https://supabase.test/auth/v1"]);

  const denied = await app.request("https://api.test/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }, env);
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get("www-authenticate") ?? "", /Bearer/);
  assert.match(denied.headers.get("www-authenticate") ?? "", /resource_metadata="https:\/\/api\.test\/\.well-known\/oauth-protected-resource"/);

  const authenticatedEnv = { ...env };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => String(input).includes("auth/v1/user") ? jsonResponse(admin) : new Response("{}", { status: 200 });
  try {
    const get = await app.request("https://api.test/mcp", { method: "GET", headers: { Authorization: "Bearer test-token" } }, authenticatedEnv);
    assert.equal(get.status, 405);
    assert.equal(get.headers.get("allow"), "POST");
    const remove = await app.request("https://api.test/mcp", { method: "DELETE", headers: { Authorization: "Bearer test-token" } }, authenticatedEnv);
    assert.equal(remove.status, 405);
    const initialized = await app.request("https://api.test/mcp", { method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }, authenticatedEnv);
    assert.equal(initialized.status, 202);
    assert.equal(await initialized.text(), "");
    const wrongType = await app.request("https://api.test/mcp", { method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "text/plain" }, body: "{}" }, authenticatedEnv);
    assert.equal(wrongType.status, 400);
    const tooLarge = await app.request("https://api.test/mcp", { method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" }, body: `{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"pad":"${"x".repeat(256 * 1024)}"}}` }, authenticatedEnv);
    assert.equal(tooLarge.status, 400);
  } finally { globalThis.fetch = previousFetch; }
});

test("MCP exposes connected account and prepares then commits a QR setup", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("auth/v1/user")) return jsonResponse(admin);
    if (url.includes("dynamic_link_units") && url.includes("public_code=eq.")) return jsonResponse([{ id: qrId, public_code: "000000000991", label: "Lote 1", status: "available", revision: 3, destination_type: "web", destination_url: "https://old.example", profile_id: null, tenant_id: null, location_id: null, location_label_snapshot: null, batch_id: null, nfc_locked_at: null, created_at: "2026-09-22T00:00:00Z", updated_at: "2026-09-22T00:00:00Z" }]);
    if (url.includes("rpc/list_business_profiles_page")) return jsonResponse({ profiles: [], totalCount: 0, pageInfo: { hasNext: false, nextCursor: null } });
    if (url.includes("business_setup_operations")) return jsonResponse([{ id: "77777777-7777-4777-8777-777777777777" }]);
    if (url.includes("rpc/commit_business_setup")) return jsonResponse({ operationId: "88888888-8888-4888-8888-888888888888", replayed: false, profile: { id: "99999999-9999-4999-8999-999999999999", slug: "cafe-prueba", status: "published", publicUrl: "https://parahoy.thaledon.com/p/cafe-prueba" }, qr: { id: qrId, code: "QR001", publicUrl: "https://go.thaledon.com/r/QR001", revision: 4 } });
    throw new Error(`Unexpected fetch ${url}`);
  };
  const call = async (id, name, args = {}) => app.request("https://api.test/mcp", { method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) }, env);
  try {
    const connected = await call(1, "parahoy_get_connected_account");
    assert.equal(connected.status, 200);
    const connectedBody = await connected.json();
    assert.equal(connectedBody.id, 1);
    assert.equal(connectedBody.result.structuredContent.role, "system_admin");
    assert.equal(connectedBody.result.structuredContent.capabilities.businessSetupV2, false);

    const unitResponse = await call(10, "parahoy_get_dynamic_link_unit", { code: "000000000991" });
    assert.equal(unitResponse.status, 200);
    const unit = (await unitResponse.json()).result.structuredContent.unit;
    assert.equal(unit.code, "000000000991");
    assert.equal(unit.publicUrl, "https://go.thaledon.com/r/000000000991");
    assert.equal(unit.revision, 3);

    const listed = await app.request("https://api.test/mcp", { method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }) }, env);
    const listedTools = (await listed.json()).result.tools;
    assert.ok(listedTools.some((tool) => tool.name === "parahoy_get_dynamic_link_unit"));

    const prepared = await call(2, "parahoy_prepare_business_setup", { qrCode: "000000000991", business: { displayName: "Café Prueba", links: [{ kind: "website", href: "https://example.com" }] } });
    assert.equal(prepared.status, 200);
    const preparedBody = await prepared.json();
    assert.equal(preparedBody.result.structuredContent.qr.code, "000000000991");
    assert.equal(preparedBody.result.structuredContent.requiresActiveQrConsent, false);

    const committed = await call(3, "parahoy_commit_business_setup", { preparationId: "77777777-7777-4777-8777-777777777777", preparationToken: "preparation-token-123456", operationId: "88888888-8888-4888-8888-888888888888", confirmed: true, duplicateDecision: "create_new" });
    assert.equal(committed.status, 200);
    assert.equal((await committed.json()).result.structuredContent.qr.revision, 4);
    assert.ok(calls.some((url) => url.includes("rpc/commit_business_setup")));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("MCP rejects untrusted JWT claims and accepts a correctly signed allowlisted client", async () => {
  const previousFetch = globalThis.fetch;
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const kid = `test-${crypto.randomUUID()}`;
  const supabaseUrl = `https://supabase-${crypto.randomUUID()}.test`;
  const authEnv = { ...env, APP_ENV: "staging", SUPABASE_URL: supabaseUrl, MCP_OAUTH_ISSUER: `${supabaseUrl}/auth/v1`, MCP_JWT_AUDIENCE: "authenticated", MCP_ALLOWED_CLIENT_IDS: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", MCP_RESOURCE_URL: "https://api.test/mcp" };
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/.well-known/jwks.json")) return jsonResponse({ keys: [{ ...publicJwk, kid, alg: "RS256", kty: "RSA" }] });
    if (url.endsWith("/auth/v1/user")) return jsonResponse(admin);
    throw new Error(`Unexpected fetch ${url}`);
  };
  const signToken = async (overrides = {}, alg = "RS256") => {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const header = encode({ alg, kid, typ: "JWT" });
    const claims = { sub: admin.id, iss: authEnv.MCP_OAUTH_ISSUER, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 300, client_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ...overrides };
    const payload = encode(claims);
    const input = `${header}.${payload}`;
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(input));
    return `${input}.${Buffer.from(signature).toString("base64url")}`;
  };
  try {
    const request = async (token) => app.request("https://api.test/mcp", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }, authEnv);
    const good = await request(await signToken());
    assert.equal(good.status, 200);
    assert.ok((await good.json()).result.tools.length >= 5);
    for (const claims of [
      { exp: Math.floor(Date.now() / 1000) - 1 },
      { nbf: Math.floor(Date.now() / 1000) + 120 },
      { sub: "not-a-uuid" },
      { client_id: undefined },
      { client_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      { iss: "https://wrong.example/auth/v1" },
      { aud: "wrong" },
    ]) {
      assert.equal((await request(await signToken(claims))).status, claims.client_id && claims.client_id !== "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" ? 403 : 401);
    }
    assert.equal((await request(await signToken({ nbf: Math.floor(Date.now() / 1000) + 30 }))).status, 200);
    assert.equal((await request(await signToken({}, "HS256"))).status, 401);
  } finally { globalThis.fetch = previousFetch; }
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
