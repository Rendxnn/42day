import assert from "node:assert/strict";
import test from "node:test";
import {
  DynamicLinkValidationError,
  buildDynamicLinkUrl,
  generateDynamicLinkCode,
  inferDynamicLinkDestinationType,
  parseDynamicLinkReference,
  validateDynamicLinkDestination,
} from "../../../packages/core/src/dynamic-links.ts";
import app from "../src/index.ts";
import {
  GoogleReviewResolutionError,
  resolveGoogleReviewDestination,
} from "../src/features/dynamic-links/google-review-resolver.ts";

const env = {
  APP_ENV: "test",
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

test("the permanent URL uses a safe, normalized code", () => {
  const code = generateDynamicLinkCode(new Uint8Array(12).fill(31));
  assert.equal(code, "ZZZZZZZZZZZZ");
  assert.equal(buildDynamicLinkUrl("https://go.thaledon.com", code), "https://go.thaledon.com/r/ZZZZZZZZZZZZ");
  assert.throws(() => buildDynamicLinkUrl("http://go.thaledon.com", code), DynamicLinkValidationError);
});

test("destinations only allow public HTTPS and official hosts for typed destinations", () => {
  assert.equal(
    validateDynamicLinkDestination({ type: "whatsapp", url: "https://wa.me/573001234567", redirectHost: "go.thaledon.com" }),
    "https://wa.me/573001234567",
  );
  assert.throws(
    () => validateDynamicLinkDestination({ type: "whatsapp", url: "https://example.com/redirect", redirectHost: "go.thaledon.com" }),
    /host_not_allowed/,
  );
  assert.throws(
    () => validateDynamicLinkDestination({ type: "website", url: "https://127.0.0.1/private", redirectHost: "go.thaledon.com" }),
    /unsafe/,
  );
  assert.throws(
    () => validateDynamicLinkDestination({ type: "website", url: "javascript:alert(1)", redirectHost: "go.thaledon.com" }),
    /unsafe/,
  );
});

test("quick setup only accepts ParaHoy codes or canonical permanent URLs and infers destination types", () => {
  assert.equal(parseDynamicLinkReference("0123456789ab", "https://go.thaledon.com"), "0123456789AB");
  assert.equal(parseDynamicLinkReference("https://go.thaledon.com/r/0123456789ab", "https://go.thaledon.com"), "0123456789AB");
  assert.equal(parseDynamicLinkReference("go.thaledon.com/r/0123456789ab", "https://go.thaledon.com"), "0123456789AB");
  assert.equal(parseDynamicLinkReference("https://go.thaledon.com/r/0123456789ab/", "https://go.thaledon.com"), "0123456789AB");
  assert.equal(parseDynamicLinkReference("https://go.thaledon.com/r/0123456789ab\u200B", "https://go.thaledon.com"), "0123456789AB");
  assert.throws(() => parseDynamicLinkReference("https://example.com/r/0123456789AB", "https://go.thaledon.com"), /reference_invalid/);
  assert.throws(() => parseDynamicLinkReference("example.com/r/0123456789AB", "https://go.thaledon.com"), /reference_invalid/);
  assert.throws(() => parseDynamicLinkReference("https://go.thaledon.com/r/0123456789AB?next=https://bad.example", "https://go.thaledon.com"), /reference_invalid/);
  assert.equal(inferDynamicLinkDestinationType({ url: "https://maps.app.goo.gl/example", publicMenuHost: "parahoy.thaledon.com" }), "google_review");
  assert.equal(inferDynamicLinkDestinationType({ url: "https://wa.me/573001234567", publicMenuHost: "parahoy.thaledon.com" }), "whatsapp");
  assert.equal(inferDynamicLinkDestinationType({ url: "https://instagram.com/parahoy", publicMenuHost: "parahoy.thaledon.com" }), "instagram");
  assert.equal(inferDynamicLinkDestinationType({ url: "https://parahoy.thaledon.com/carta?tenant=demo", publicMenuHost: "parahoy.thaledon.com" }), "menu");
  assert.equal(inferDynamicLinkDestinationType({ url: "https://example.com/menu", publicMenuHost: "parahoy.thaledon.com" }), "website");
});

test("a public active link redirects temporarily without caching a prior destination", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("dynamic_link_units")) {
      return jsonResponse([{
        id: "unit-1",
        public_code: "0123456789AB",
        label: "Pilot",
        status: "active",
        revision: 1,
        destination_type: "website",
        destination_url: "https://example.com/new-target",
        created_at: "2026-09-07T00:00:00Z",
        updated_at: "2026-09-07T00:00:00Z",
      }]);
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const response = await app.request("https://go.thaledon.com/r/0123456789ab", undefined, env);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://example.com/new-target");
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("unconfigured and unknown public links use safe fallbacks", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse([]);
  try {
    const response = await app.request("https://go.thaledon.com/r/0123456789AB", undefined, env);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.doesNotMatch(await response.text(), /destination|0123456789AB/i);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("inventory endpoints require a system administrator", async () => {
  const unauthenticated = await app.request("https://api.test/dashboard/admin/dynamic-links", undefined, env);
  assert.equal(unauthenticated.status, 401);

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.match(String(input), /auth\/v1\/user/);
    return jsonResponse({ id: "ordinary-user", app_metadata: {} });
  };
  try {
    const ordinaryUser = await app.request(
      "https://api.test/dashboard/admin/dynamic-links",
      { headers: { Authorization: "Bearer test-token" } },
      env,
    );
    assert.equal(ordinaryUser.status, 403);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Google review resolver endpoint requires an admin and converts a Maps short link", async () => {
  const unauthenticated = await app.request(
    "https://api.test/dashboard/admin/dynamic-links/google-review/resolve",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinationUrl: "https://maps.app.goo.gl/example" }),
    },
    env,
  );
  assert.equal(unauthenticated.status, 401);

  const previousFetch = globalThis.fetch;
  const previousInfo = console.info;
  const requested = [];
  const logs = [];
  console.info = (entry) => logs.push(entry);
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("auth/v1/user")) {
      return jsonResponse({ id: "admin-user", app_metadata: { system_admin: true } });
    }
    requested.push({ url, init });
    return new Response(null, {
      status: 302,
      headers: {
        Location: "https://www.google.com/maps/place/ShopTime/data=!4m6!3m5!1s0x8E4683F4AAC3FA5B:0xB4BB717C74160CEA!8m2",
      },
    });
  };

  try {
    const response = await app.request(
      "https://api.test/dashboard/admin/dynamic-links/google-review/resolve",
      {
        method: "POST",
        headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
        body: JSON.stringify({ destinationUrl: "https://maps.app.goo.gl/example" }),
      },
      env,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      resolution: {
        sourceKind: "maps_short_link",
        reviewUrl: "https://www.google.com/maps/place//data=!4m3!3m2!1s0x8e4683f4aac3fa5b:0xb4bb717c74160cea!12e1",
        candidateLabel: "ShopTime",
        confirmationRequired: true,
      },
    });
    assert.equal(requested.length, 1);
    assert.equal(requested[0].init.redirect, "manual");
    assert.equal(requested[0].init.method, "GET");
    const serializedLogs = JSON.stringify(logs);
    assert.match(serializedLogs, /dynamic_link\.google_review_resolution_succeeded/);
    assert.match(serializedLogs, /maps\.app\.goo\.gl/);
    assert.doesNotMatch(serializedLogs, /\/example/);
    assert.doesNotMatch(serializedLogs, /0x8e4683f4aac3fa5b/i);
  } finally {
    globalThis.fetch = previousFetch;
    console.info = previousInfo;
  }
});

test("Google review resolver accepts an already-direct URL without a network request", async () => {
  let calls = 0;
  const result = await resolveGoogleReviewDestination(
    "https://g.page/example/review",
    { fetcher: async () => { calls += 1; throw new Error("unexpected"); } },
  );
  assert.equal(result.resolution.sourceKind, "direct_review_url");
  assert.equal(result.resolution.reviewUrl, "https://g.page/example/review");
  assert.equal(result.redirectCount, 0);
  assert.equal(calls, 0);
});

test("Google review resolver returns a typed unsupported error", async () => {
  await assert.rejects(
    resolveGoogleReviewDestination("https://example.com/maps"),
    (error) => error instanceof GoogleReviewResolutionError
      && error.code === "google_review_url_unsupported"
      && error.status === 400,
  );
});

test("Google review resolver rejects unsafe inputs before any network request", async () => {
  let calls = 0;
  for (const input of [
    "http://maps.app.goo.gl/example",
    "https://user:password@maps.app.goo.gl/example",
    "https://maps.app.goo.gl:444/example",
  ]) {
    await assert.rejects(
      resolveGoogleReviewDestination(input, {
        fetcher: async () => {
          calls += 1;
          throw new Error("unexpected");
        },
      }),
      (error) => error instanceof GoogleReviewResolutionError
        && error.code === "google_review_url_invalid"
        && error.status === 400,
    );
  }
  assert.equal(calls, 0);
});

test("Google review resolver follows relative redirects and cancels bodies without reading them", async () => {
  const requested = [];
  let cancelled = 0;
  const responses = [
    () => new Response(new ReadableStream({ cancel() { cancelled += 1; } }), {
      status: 302,
      headers: { Location: "/second" },
    }),
    () => new Response(new ReadableStream({ cancel() { cancelled += 1; } }), {
      status: 302,
      headers: { Location: "https://www.google.com/maps/place/Cafe/data=!4m6!1s0x1:0x2!8m2" },
    }),
  ];
  const result = await resolveGoogleReviewDestination("https://maps.app.goo.gl/first", {
    fetcher: async (url, init) => {
      requested.push({ url: String(url), init });
      return responses.shift()();
    },
  });

  assert.equal(result.redirectCount, 2);
  assert.equal(result.resolution.reviewUrl, "https://www.google.com/maps/place//data=!4m3!3m2!1s0x1:0x2!12e1");
  assert.deepEqual(requested.map(({ url }) => url), [
    "https://maps.app.goo.gl/first",
    "https://maps.app.goo.gl/second",
  ]);
  assert.equal(cancelled, 2);
});

test("Google review resolver accepts the observed maps.google.com root query redirect", async () => {
  const requested = [];
  const result = await resolveGoogleReviewDestination(
    "https://maps.app.goo.gl/5XSASCKPDCxK4Fnu5?g_st=ic",
    {
      fetcher: async (url) => {
        requested.push(String(url));
        return new Response(null, {
          status: 302,
          headers: {
            Location: "https://maps.google.com/?q=ShopTime&ftid=0x8e4683f4aac3fa5b:0xb4bb717c74160cea&entry=gps&g_st=ic",
          },
        });
      },
    },
  );

  assert.deepEqual(requested, ["https://maps.app.goo.gl/5XSASCKPDCxK4Fnu5?g_st=ic"]);
  assert.equal(result.redirectCount, 1);
  assert.equal(
    result.resolution.reviewUrl,
    "https://www.google.com/maps/place//data=!4m3!3m2!1s0x8e4683f4aac3fa5b:0xb4bb717c74160cea!12e1",
  );
});

test("Google review resolver blocks external redirects, loops and excessive redirect chains", async () => {
  let calls = 0;
  await assert.rejects(
    resolveGoogleReviewDestination("https://maps.app.goo.gl/external", {
      fetcher: async () => {
        calls += 1;
        return new Response(null, { status: 302, headers: { Location: "https://example.com/private" } });
      },
    }),
    (error) => error instanceof GoogleReviewResolutionError && error.code === "google_review_redirect_invalid",
  );
  assert.equal(calls, 1);

  await assert.rejects(
    resolveGoogleReviewDestination("https://maps.app.goo.gl/loop", {
      fetcher: async () => new Response(null, { status: 302, headers: { Location: "/loop" } }),
    }),
    (error) => error instanceof GoogleReviewResolutionError && error.code === "google_review_redirect_invalid",
  );

  let hop = 0;
  await assert.rejects(
    resolveGoogleReviewDestination("https://maps.app.goo.gl/hop-0", {
      fetcher: async () => {
        hop += 1;
        return new Response(null, { status: 302, headers: { Location: `/hop-${hop}` } });
      },
    }),
    (error) => error instanceof GoogleReviewResolutionError && error.code === "google_review_redirect_invalid",
  );
  assert.equal(hop, 5);
});

test("Google review resolver rejects redirects without Location or toward HTTP", async () => {
  await assert.rejects(
    resolveGoogleReviewDestination("https://maps.app.goo.gl/missing-location", {
      fetcher: async () => new Response(null, { status: 302 }),
    }),
    (error) => error instanceof GoogleReviewResolutionError && error.code === "google_review_redirect_invalid",
  );
  await assert.rejects(
    resolveGoogleReviewDestination("https://maps.app.goo.gl/http", {
      fetcher: async () => new Response(null, {
        status: 302,
        headers: { Location: "http://www.google.com/maps/place/Cafe" },
      }),
    }),
    (error) => error instanceof GoogleReviewResolutionError && error.code === "google_review_redirect_invalid",
  );
});

test("Google review resolver maps missing identifiers, upstream failures and aborts", async () => {
  await assert.rejects(
    resolveGoogleReviewDestination("https://maps.app.goo.gl/missing", {
      fetcher: async () => new Response(null, { status: 200 }),
    }),
    (error) => error instanceof GoogleReviewResolutionError && error.code === "google_review_identifier_missing" && error.status === 422,
  );
  await assert.rejects(
    resolveGoogleReviewDestination("https://maps.app.goo.gl/upstream", {
      fetcher: async () => new Response(null, { status: 503 }),
    }),
    (error) => error instanceof GoogleReviewResolutionError && error.code === "google_review_upstream_failed" && error.status === 502,
  );
  await assert.rejects(
    resolveGoogleReviewDestination("https://maps.app.goo.gl/timeout", {
      fetcher: async () => { throw new DOMException("Aborted", "AbortError"); },
    }),
    (error) => error instanceof GoogleReviewResolutionError && error.code === "google_review_resolution_timeout" && error.status === 504,
  );
});

test("Google review resolver rejects ambiguous identifiers", async () => {
  await assert.rejects(
    resolveGoogleReviewDestination("https://maps.app.goo.gl/ambiguous", {
      fetcher: async () => new Response(null, {
        status: 302,
        headers: { Location: "https://www.google.com/maps?ftid=0x1:0x2#data=!1s0x1:0x3" },
      }),
    }),
    (error) => error instanceof GoogleReviewResolutionError && error.code === "google_review_identifier_ambiguous",
  );
});

test("Google review resolver rejects malformed bodies with a stable error", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).includes("auth/v1/user")) return jsonResponse({ id: "admin-user", app_metadata: { system_admin: true } });
    throw new Error("unexpected external fetch");
  };
  try {
    const response = await app.request(
      "https://api.test/dashboard/admin/dynamic-links/google-review/resolve",
      { method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" }, body: "{}" },
      env,
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "google_review_url_invalid");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("admin writes reject new unresolved Google destinations", async () => {
  const previousFetch = globalThis.fetch;
  const unit = {
    id: "66666666-6666-4666-8666-666666666666",
    public_code: "0123456789AB",
    label: "Pilot",
    status: "available",
    revision: 1,
    destination_type: null,
    destination_url: null,
    created_at: "2026-09-07T00:00:00Z",
    updated_at: "2026-09-07T00:00:00Z",
  };
  let mutationCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("auth/v1/user")) return jsonResponse({ id: "admin-user", app_metadata: { system_admin: true } });
    if (url.includes("dynamic_link_units")) return jsonResponse([unit]);
    if (url.includes("rpc/update_dynamic_link_unit")) mutationCalls += 1;
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    for (const [path, body] of [
      ["/quick-configuration", { revision: 1, label: "Pilot", destinationUrl: "https://maps.app.goo.gl/example" }],
      ["", { revision: 1, destinationType: "google_review", destinationUrl: "https://www.google.com/maps/place/Cafe" }],
    ]) {
      const response = await app.request(
        `https://api.test/dashboard/admin/dynamic-links/${unit.id}${path}`,
        { method: "PATCH", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" }, body: JSON.stringify(body) },
        env,
      );
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, "dynamic_link_google_review_resolution_required");
    }
    assert.equal(mutationCalls, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("admin writes preserve an unchanged legacy Google destination", async () => {
  const previousFetch = globalThis.fetch;
  const unit = {
    id: "77777777-7777-4777-8777-777777777777",
    public_code: "0123456789AB",
    label: "Antes",
    status: "active",
    revision: 2,
    destination_type: "google_review",
    destination_url: "https://maps.app.goo.gl/legacy",
    created_at: "2026-09-07T00:00:00Z",
    updated_at: "2026-09-07T00:00:00Z",
  };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("auth/v1/user")) return jsonResponse({ id: "admin-user", app_metadata: { system_admin: true } });
    if (url.includes("dynamic_link_units")) return jsonResponse([unit]);
    if (url.includes("rpc/update_dynamic_link_unit")) {
      const payload = JSON.parse(init.body);
      assert.equal(payload.p_patch.destination_url, "https://maps.app.goo.gl/legacy");
      return jsonResponse([{ ...unit, label: "Después", revision: 3 }]);
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const response = await app.request(
      `https://api.test/dashboard/admin/dynamic-links/${unit.id}`,
      {
        method: "PATCH",
        headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
        body: JSON.stringify({ revision: 2, label: "Después", destinationType: "google_review", destinationUrl: unit.destination_url }),
      },
      env,
    );
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("quick setup resolves exactly by code and saves activation in one audited RPC", async () => {
  const previousFetch = globalThis.fetch;
  const unit = {
    id: "11111111-1111-4111-8111-111111111111",
    public_code: "0123456789AB",
    label: "Antes",
    status: "suspended",
    revision: 3,
    destination_type: "website",
    destination_url: "https://example.com/old",
    created_at: "2026-09-07T00:00:00Z",
    updated_at: "2026-09-07T00:00:00Z",
  };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("auth/v1/user")) return jsonResponse({ id: "admin-user", app_metadata: { system_admin: true } });
    if (url.includes("dynamic_link_units") && url.includes("public_code=eq.0123456789AB")) return jsonResponse([unit]);
    if (url.includes("dynamic_link_units") && url.includes("id=eq.11111111-1111-4111-8111-111111111111")) return jsonResponse([unit]);
    if (url.includes("rpc/update_dynamic_link_unit")) {
      const payload = JSON.parse(init.body);
      assert.equal(payload.p_event_type, "activated");
      assert.deepEqual(payload.p_patch, {
        label: "Café piloto",
        destination_type: "whatsapp",
        destination_url: "https://wa.me/573001234567",
        status: "active",
        tenant_id: null,
        location_id: null,
        location_label_snapshot: null,
      });
      return jsonResponse([{ ...unit, label: "Café piloto", status: "active", revision: 4, destination_type: "whatsapp", destination_url: "https://wa.me/573001234567" }]);
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const lookup = await app.request("https://api.test/dashboard/admin/dynamic-links/by-code/0123456789ab", { headers: { Authorization: "Bearer test-token" } }, env);
    assert.equal(lookup.status, 200);
    const response = await app.request("https://api.test/dashboard/admin/dynamic-links/11111111-1111-4111-8111-111111111111/quick-configuration", {
      method: "PATCH",
      headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
      body: JSON.stringify({ revision: 3, label: " Café piloto ", destinationUrl: "https://wa.me/573001234567", tenantId: null }),
    }, env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).unit.status, "active");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("quick setup rejects archived units and returns a revision conflict without a partial update", async () => {
  const previousFetch = globalThis.fetch;
  const baseUnit = {
    id: "22222222-2222-4222-8222-222222222222",
    public_code: "0123456789AB",
    label: "Pilot",
    status: "archived",
    revision: 5,
    created_at: "2026-09-07T00:00:00Z",
    updated_at: "2026-09-07T00:00:00Z",
  };
  let status = "archived";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("auth/v1/user")) return jsonResponse({ id: "admin-user", app_metadata: { system_admin: true } });
    if (url.includes("dynamic_link_units")) return jsonResponse([{ ...baseUnit, status }]);
    if (url.includes("rpc/update_dynamic_link_unit")) return new Response("dynamic_link_stale", { status: 409 });
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const archived = await app.request("https://api.test/dashboard/admin/dynamic-links/22222222-2222-4222-8222-222222222222/quick-configuration", {
      method: "PATCH",
      headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
      body: JSON.stringify({ revision: 5, label: "Pilot", destinationUrl: "https://example.com" }),
    }, env);
    assert.equal(archived.status, 409);
    assert.equal((await archived.json()).error, "dynamic_link_archived");

    status = "available";
    const stale = await app.request("https://api.test/dashboard/admin/dynamic-links/22222222-2222-4222-8222-222222222222/quick-configuration", {
      method: "PATCH",
      headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
      body: JSON.stringify({ revision: 5, label: "Pilot", destinationUrl: "https://example.com" }),
    }, env);
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error, "dynamic_link_stale");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("quick setup can assign the selected business and its primary location", async () => {
  const previousFetch = globalThis.fetch;
  const unit = {
    id: "33333333-3333-4333-8333-333333333333", public_code: "0123456789AB", label: "Pilot", status: "available", revision: 1,
    created_at: "2026-09-07T00:00:00Z", updated_at: "2026-09-07T00:00:00Z",
  };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("auth/v1/user")) return jsonResponse({ id: "admin-user", app_metadata: { system_admin: true } });
    if (url.includes("dynamic_link_units")) return jsonResponse([unit]);
    if (url.includes("rest/v1/tenants")) return jsonResponse([{
      id: "44444444-4444-4444-8444-444444444444", name: "Café Central", slug: "cafe-central", schema_name: "tenant_cafe", status: "active",
      timezone: "America/Bogota", currency: "COP", automation_enabled: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    }]);
    if (url.includes("rest/v1/tenant_users")) return jsonResponse([]);
    if (url.includes("rpc/get_tenant_admin_snapshot")) return jsonResponse({ location: { id: "55555555-5555-4555-8555-555555555555", name: "Principal", is_active: true } });
    if (url.includes("rpc/update_dynamic_link_unit")) {
      const payload = JSON.parse(init.body);
      assert.equal(payload.p_patch.tenant_id, "44444444-4444-4444-8444-444444444444");
      assert.equal(payload.p_patch.location_id, "55555555-5555-4555-8555-555555555555");
      assert.equal(payload.p_patch.location_label_snapshot, "Principal");
      return jsonResponse([{ ...unit, status: "active", revision: 2 }]);
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const response = await app.request("https://api.test/dashboard/admin/dynamic-links/33333333-3333-4333-8333-333333333333/quick-configuration", {
      method: "PATCH",
      headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
      body: JSON.stringify({ revision: 1, label: "Café Central", destinationUrl: "https://example.com", tenantId: "44444444-4444-4444-8444-444444444444" }),
    }, env);
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
}
