import type { ApiBindings } from "../../lib/bindings";

type WhatsAppMediaMetadata = {
  url?: string;
  mime_type?: string;
  file_size?: number;
};

type OpenAITranscriptionResponse = {
  text?: unknown;
  error?: { message?: string };
};

export async function transcribeWhatsAppAudio(input: {
  env: ApiBindings;
  mediaId: string;
  mimeType?: string;
}): Promise<string> {
  const provider = input.env.AUDIO_TRANSCRIPTION_PROVIDER?.trim().toLowerCase()
    || (input.env.OPENAI_API_KEY?.trim() ? "openai" : "huggingface");
  if (provider === "openai" && !input.env.OPENAI_API_KEY?.trim()) {
    throw new Error("audio_transcription.openai_key_missing");
  }
  if (provider === "huggingface" && !input.env.HUGGINGFACE_API_KEY?.trim()) {
    throw new Error("audio_transcription.huggingface_key_missing");
  }
  if (provider !== "openai" && provider !== "huggingface") {
    throw new Error(`audio_transcription.provider_unsupported:${provider}`);
  }

  const metadata = await fetchWhatsAppMediaMetadata(input.env, input.mediaId);
  if (!metadata.url) {
    throw new Error("audio_transcription.media_url_missing");
  }

  const mediaResponse = await fetch(metadata.url, {
    headers: { Authorization: `Bearer ${input.env.META_ACCESS_TOKEN}` },
  });
  if (!mediaResponse.ok) {
    throw new Error(`audio_transcription.media_download_failed:${mediaResponse.status}`);
  }

  const data = await mediaResponse.arrayBuffer();
  if (data.byteLength === 0) {
    throw new Error("audio_transcription.empty_audio");
  }

  const mimeType = metadata.mime_type ?? input.mimeType ?? "audio/ogg";
  if (provider === "huggingface") {
    return transcribeWithHuggingFace(input.env, data, mimeType);
  }

  const apiKey = input.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("audio_transcription.openai_key_missing");
  }

  const form = new FormData();
  form.append("file", new Blob([data], { type: mimeType }), filenameForAudio(mimeType));
  form.append("model", input.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "whisper-1");
  form.append("language", "es");
  form.append("prompt", "pedido restaurante Colombia, domicilio, menú, desayuno, almuerzo, gaseosa, adiciones, dirección");
  form.append("response_format", "json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const payload = await response.json().catch(() => ({})) as OpenAITranscriptionResponse;
  if (!response.ok) {
    throw new Error(`audio_transcription.openai_failed:${response.status}:${String(payload.error?.message ?? "unknown")}`);
  }

  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) {
    throw new Error("audio_transcription.empty_result");
  }

  return text;
}

async function transcribeWithHuggingFace(env: ApiBindings, data: ArrayBuffer, mimeType: string): Promise<string> {
  const apiKey = env.HUGGINGFACE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("audio_transcription.huggingface_key_missing");
  }

  const model = env.HUGGINGFACE_TRANSCRIPTION_MODEL?.trim() || "openai/whisper-large-v3-turbo";
  const url = env.HUGGINGFACE_TRANSCRIPTION_URL?.trim()
    || `https://router.huggingface.co/hf-inference/models/${model}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": mimeType,
      Accept: "application/json",
    },
    body: data,
  });
  const payload = await response.json().catch(() => ({})) as OpenAITranscriptionResponse;
  if (!response.ok) {
    throw new Error(`audio_transcription.huggingface_failed:${response.status}:${String(payload.error?.message ?? "unknown")}`);
  }

  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) {
    throw new Error("audio_transcription.empty_result");
  }

  return text;
}

async function fetchWhatsAppMediaMetadata(env: ApiBindings, mediaId: string): Promise<WhatsAppMediaMetadata> {
  const version = env.META_GRAPH_API_VERSION ?? "v22.0";
  const response = await fetch(`https://graph.facebook.com/${version}/${mediaId}`, {
    headers: { Authorization: `Bearer ${env.META_ACCESS_TOKEN}` },
  });
  if (!response.ok) {
    throw new Error(`audio_transcription.media_metadata_failed:${response.status}`);
  }

  const payload = await response.json().catch(() => ({})) as WhatsAppMediaMetadata;
  return payload;
}

function filenameForAudio(mimeType: string): string {
  const subtype = mimeType.split("/", 2)[1]?.split(";", 1)[0]?.trim().toLowerCase();
  const extension = subtype === "mpeg" ? "mp3" : subtype === "mp4" ? "m4a" : subtype || "ogg";
  return `whatsapp-audio.${extension}`;
}
