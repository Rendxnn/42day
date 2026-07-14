import assert from "node:assert/strict";
import test from "node:test";
import { transcribeWhatsAppAudio } from "../src/modules/audio-transcription/audio-transcription.ts";

const env = {
  META_ACCESS_TOKEN: "meta-token",
  META_GRAPH_API_VERSION: "v22.0",
  OPENAI_API_KEY: "openai-key",
};

test("transcribe audio de WhatsApp usando Whisper y devuelve texto", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) {
      return new Response(JSON.stringify({ url: "https://media.example/audio.ogg", mime_type: "audio/ogg" }), { status: 200 });
    }
    if (calls.length === 2) {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Type": "audio/ogg" } });
    }
    return new Response(JSON.stringify({ text: "quiero dos desayunos" }), { status: 200 });
  };

  try {
    const text = await transcribeWhatsAppAudio({ env, mediaId: "media-1" });
    assert.equal(text, "quiero dos desayunos");
    assert.equal(calls.length, 3);
    assert.match(calls[2].url, /api\.openai\.com\/v1\/audio\/transcriptions/);
    assert.equal(calls[2].init.method, "POST");
    assert.equal(calls[2].init.headers.Authorization, "Bearer openai-key");
    assert.ok(calls[2].init.body instanceof FormData);
    assert.equal(calls[2].init.body.get("model"), "whisper-1");
    assert.equal(calls[2].init.body.get("language"), "es");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("falla de forma explicita si falta la llave de OpenAI", async () => {
  await assert.rejects(
    transcribeWhatsAppAudio({ env: { ...env, OPENAI_API_KEY: "", AUDIO_TRANSCRIPTION_PROVIDER: "openai" }, mediaId: "media-1" }),
    /openai_key_missing/,
  );
});

test("puede usar Hugging Face como proveedor gratuito configurable", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) {
      return new Response(JSON.stringify({ url: "https://media.example/audio.ogg", mime_type: "audio/ogg" }), { status: 200 });
    }
    if (calls.length === 2) {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }
    return new Response(JSON.stringify({ text: "quiero un almuerzo" }), { status: 200 });
  };

  try {
    const text = await transcribeWhatsAppAudio({
      env: {
        ...env,
        OPENAI_API_KEY: "",
        AUDIO_TRANSCRIPTION_PROVIDER: "huggingface",
        HUGGINGFACE_API_KEY: "hf-token",
      },
      mediaId: "media-2",
    });
    assert.equal(text, "quiero un almuerzo");
    assert.match(calls[2].url, /router\.huggingface\.co\/hf-inference\/models/);
    assert.equal(calls[2].init.headers.Authorization, "Bearer hf-token");
    assert.equal(calls[2].init.headers["Content-Type"], "audio/ogg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
