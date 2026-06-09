import type { NormalizedInboundMessage, WhatsAppMessageType } from "@42day/types";

type WhatsAppWebhookPayload = {
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: {
        metadata?: {
          phone_number_id?: string;
        };
        messages?: Array<Record<string, unknown>>;
      };
    }>;
  }>;
};

export function normalizeWhatsAppPayload(payload: unknown): NormalizedInboundMessage[] {
  const webhook = payload as WhatsAppWebhookPayload;
  const messages: NormalizedInboundMessage[] = [];

  for (const entry of webhook.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;

      if (!phoneNumberId) {
        continue;
      }

      for (const rawMessage of value.messages ?? []) {
        const normalized = normalizeMessage(rawMessage, phoneNumberId, entry.id);

        if (normalized) {
          messages.push(normalized);
        }
      }
    }
  }

  return messages;
}

function normalizeMessage(rawMessage: Record<string, unknown>, phoneNumberId: string, wabaId?: string): NormalizedInboundMessage | null {
  const id = typeof rawMessage.id === "string" ? rawMessage.id : undefined;
  const from = typeof rawMessage.from === "string" ? rawMessage.from : undefined;

  if (!id || !from) {
    return null;
  }

  const type = normalizeMessageType(rawMessage.type);
  const text = extractText(rawMessage, type);
  const mediaId = extractMediaId(rawMessage, type);
  const mediaCaption = extractMediaCaption(rawMessage, type);
  const mediaMimeType = extractMediaMimeType(rawMessage, type);
  const mediaFilename = extractMediaFilename(rawMessage, type);
  const location = extractLocation(rawMessage, type);

  return {
    provider: "whatsapp_cloud",
    providerMessageId: id,
    phoneNumberId,
    wabaId,
    from,
    timestamp: typeof rawMessage.timestamp === "string" ? rawMessage.timestamp : undefined,
    type,
    text,
    mediaId,
    mediaCaption,
    mediaMimeType,
    mediaFilename,
    location,
    raw: rawMessage,
  };
}

function normalizeMessageType(type: unknown): WhatsAppMessageType {
  if (
    type === "text" ||
    type === "button" ||
    type === "interactive" ||
    type === "image" ||
    type === "document" ||
    type === "audio" ||
    type === "location"
  ) {
    return type;
  }

  return "unknown";
}

function extractText(rawMessage: Record<string, unknown>, type: WhatsAppMessageType): string | undefined {
  if (type === "text") {
    const text = rawMessage.text as { body?: unknown } | undefined;
    return typeof text?.body === "string" ? text.body : undefined;
  }

  if (type === "button") {
    const button = rawMessage.button as { text?: unknown; payload?: unknown } | undefined;
    if (typeof button?.text === "string") {
      return button.text;
    }

    return typeof button?.payload === "string" ? button.payload : undefined;
  }

  if (type === "interactive") {
    const interactive = rawMessage.interactive as
      | {
          button_reply?: { title?: unknown; id?: unknown };
          list_reply?: { title?: unknown; id?: unknown };
        }
      | undefined;

    const reply = interactive?.button_reply ?? interactive?.list_reply;

    if (typeof reply?.title === "string") {
      return reply.title;
    }

    return typeof reply?.id === "string" ? reply.id : undefined;
  }

  return undefined;
}

function extractMediaId(rawMessage: Record<string, unknown>, type: WhatsAppMessageType): string | undefined {
  if (type !== "image" && type !== "document" && type !== "audio") {
    return undefined;
  }

  const media = rawMessage[type] as { id?: unknown } | undefined;
  return typeof media?.id === "string" ? media.id : undefined;
}

function extractMediaCaption(rawMessage: Record<string, unknown>, type: WhatsAppMessageType): string | undefined {
  if (type !== "image" && type !== "document") {
    return undefined;
  }

  const media = rawMessage[type] as { caption?: unknown } | undefined;
  return typeof media?.caption === "string" ? media.caption : undefined;
}

function extractMediaMimeType(rawMessage: Record<string, unknown>, type: WhatsAppMessageType): string | undefined {
  if (type !== "image" && type !== "document" && type !== "audio") {
    return undefined;
  }

  const media = rawMessage[type] as { mime_type?: unknown } | undefined;
  return typeof media?.mime_type === "string" ? media.mime_type : undefined;
}

function extractMediaFilename(rawMessage: Record<string, unknown>, type: WhatsAppMessageType): string | undefined {
  if (type !== "document") {
    return undefined;
  }

  const media = rawMessage[type] as { filename?: unknown } | undefined;
  return typeof media?.filename === "string" ? media.filename : undefined;
}

function extractLocation(rawMessage: Record<string, unknown>, type: WhatsAppMessageType) {
  if (type !== "location") {
    return undefined;
  }

  const location = rawMessage.location as
    | {
        latitude?: unknown;
        longitude?: unknown;
        name?: unknown;
        address?: unknown;
      }
    | undefined;

  if (typeof location?.latitude !== "number" || typeof location.longitude !== "number") {
    return undefined;
  }

  return {
    latitude: location.latitude,
    longitude: location.longitude,
    name: typeof location.name === "string" ? location.name : undefined,
    address: typeof location.address === "string" ? location.address : undefined,
  };
}
