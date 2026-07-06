import assert from "node:assert/strict";
import test from "node:test";
import { downloadLatestPaymentProofForOrder } from "../src/features/payment-proofs/service.ts";

const TEST_ENV = {
  APP_ENV: "test",
  META_VERIFY_TOKEN: "verify-token",
  META_ACCESS_TOKEN: "meta-token",
  META_PHONE_NUMBER_ID: "phone-id",
  META_WABA_ID: "waba-id",
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function textResponse(body, init = {}) {
  return new Response(body, init);
}

test("downloadLatestPaymentProofForOrder usa signed URL para descargar comprobantes privados", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === "string" ? input : input.url;
    calls.push({ url: requestUrl, method: (init.method ?? "GET").toUpperCase() });

    if (requestUrl.startsWith(`${TEST_ENV.SUPABASE_URL}/rest/v1/payment_proofs`)) {
      return jsonResponse([
        {
          id: "proof-1",
          conversation_id: "conversation-1",
          message_id: "message-1",
          draft_order_id: "draft-1",
          order_id: "order-1",
          storage_bucket: "payment-proofs",
          storage_path: "tenant_demo/2026/07/order-1/message-1.png",
          provider_media_id: "media-1",
          mime_type: "image/png",
          file_size: 12345,
          status: "review_pending",
          created_at: "2026-07-05T12:04:00.000Z",
          reviewed_at: null,
          reviewed_by: null,
        },
      ]);
    }

    if (requestUrl === `${TEST_ENV.SUPABASE_URL}/storage/v1/object/sign/payment-proofs/tenant_demo/2026/07/order-1/message-1.png`) {
      return jsonResponse({
        signedURL: "/storage/v1/object/sign/payment-proofs/tenant_demo/2026/07/order-1/message-1.png?token=abc",
      });
    }

    if (requestUrl === `${TEST_ENV.SUPABASE_URL}/storage/v1/object/sign/payment-proofs/tenant_demo/2026/07/order-1/message-1.png?token=abc`) {
      return new Response(new Uint8Array([9, 8, 7]), {
        headers: {
          "Content-Type": "image/png",
        },
      });
    }

    throw new Error(`Unexpected fetch ${requestUrl}`);
  };

  try {
    const result = await downloadLatestPaymentProofForOrder({
      env: TEST_ENV,
      schemaName: "tenant_demo",
      orderId: "order-1",
      paymentProofId: "proof-1",
    });

    assert.ok(result);
    assert.equal(result.contentType, "image/png");
    assert.deepEqual(Array.from(new Uint8Array(result.data)), [9, 8, 7]);
    assert.ok(calls.some((call) => call.url.includes("/storage/v1/object/sign/payment-proofs/tenant_demo/2026/07/order-1/message-1.png")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("downloadLatestPaymentProofForOrder falla con error distinguible cuando no puede firmar la descarga", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const requestUrl = typeof input === "string" ? input : input.url;

    if (requestUrl.startsWith(`${TEST_ENV.SUPABASE_URL}/rest/v1/payment_proofs`)) {
      return jsonResponse([
        {
          id: "proof-1",
          conversation_id: "conversation-1",
          message_id: "message-1",
          draft_order_id: "draft-1",
          order_id: "order-1",
          storage_bucket: "payment-proofs",
          storage_path: "tenant_demo/2026/07/order-1/message-1.png",
          provider_media_id: "media-1",
          mime_type: "image/png",
          file_size: 12345,
          status: "review_pending",
          created_at: "2026-07-05T12:04:00.000Z",
          reviewed_at: null,
          reviewed_by: null,
        },
      ]);
    }

    if (requestUrl === `${TEST_ENV.SUPABASE_URL}/storage/v1/object/sign/payment-proofs/tenant_demo/2026/07/order-1/message-1.png`) {
      return textResponse("sign failed", { status: 500 });
    }

    throw new Error(`Unexpected fetch ${requestUrl}`);
  };

  try {
    await assert.rejects(
      () => downloadLatestPaymentProofForOrder({
        env: TEST_ENV,
        schemaName: "tenant_demo",
        orderId: "order-1",
        paymentProofId: "proof-1",
      }),
      /payment_proof\.sign_url_failed:500/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("downloadLatestPaymentProofForOrder usa descarga autenticada como fallback cuando la signed URL responde 404", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === "string" ? input : input.url;
    calls.push({ url: requestUrl, method: (init.method ?? "GET").toUpperCase() });

    if (requestUrl.startsWith(`${TEST_ENV.SUPABASE_URL}/rest/v1/payment_proofs`)) {
      return jsonResponse([
        {
          id: "proof-1",
          conversation_id: "conversation-1",
          message_id: "message-1",
          draft_order_id: "draft-1",
          order_id: "order-1",
          storage_bucket: "payment-proofs",
          storage_path: "tenant_demo/2026/07/order-1/message-1.png",
          provider_media_id: "media-1",
          mime_type: "image/png",
          file_size: 12345,
          status: "review_pending",
          created_at: "2026-07-05T12:04:00.000Z",
          reviewed_at: null,
          reviewed_by: null,
        },
      ]);
    }

    if (requestUrl === `${TEST_ENV.SUPABASE_URL}/storage/v1/object/sign/payment-proofs/tenant_demo/2026/07/order-1/message-1.png`) {
      return jsonResponse({
        signedURL: "/storage/v1/object/sign/payment-proofs/tenant_demo/2026/07/order-1/message-1.png?token=abc",
      });
    }

    if (requestUrl === `${TEST_ENV.SUPABASE_URL}/storage/v1/object/sign/payment-proofs/tenant_demo/2026/07/order-1/message-1.png?token=abc`) {
      return textResponse("missing through signed url", { status: 404 });
    }

    if (requestUrl === `${TEST_ENV.SUPABASE_URL}/storage/v1/object/authenticated/payment-proofs/tenant_demo/2026/07/order-1/message-1.png`) {
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          "Content-Type": "image/png",
        },
      });
    }

    throw new Error(`Unexpected fetch ${requestUrl}`);
  };

  try {
    const result = await downloadLatestPaymentProofForOrder({
      env: TEST_ENV,
      schemaName: "tenant_demo",
      orderId: "order-1",
      paymentProofId: "proof-1",
    });

    assert.ok(result);
    assert.equal(result.contentType, "image/png");
    assert.deepEqual(Array.from(new Uint8Array(result.data)), [1, 2, 3]);
    assert.ok(calls.some((call) => call.url.includes("/storage/v1/object/sign/payment-proofs/tenant_demo/2026/07/order-1/message-1.png?token=abc")));
    assert.ok(calls.some((call) => call.url.includes("/storage/v1/object/authenticated/payment-proofs/tenant_demo/2026/07/order-1/message-1.png")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
