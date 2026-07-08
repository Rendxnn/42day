import type { OutboundImageMessage, OutboundMessageResult, OutboundTextMessage } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";

type WhatsAppSendTextResponse = {
  messaging_product?: "whatsapp";
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string }>;
  error?: unknown;
};

export async function sendWhatsAppTextMessage(env: ApiBindings, message: OutboundTextMessage): Promise<OutboundMessageResult> {
  return sendWhatsAppMessage(env, {
    messaging_product: "whatsapp",
    to: message.to,
    type: "text",
    text: {
      preview_url: false,
      body: message.text,
    },
  });
}

export async function sendWhatsAppImageMessage(env: ApiBindings, message: OutboundImageMessage): Promise<OutboundMessageResult> {
  return sendWhatsAppMessage(env, {
    messaging_product: "whatsapp",
    to: message.to,
    type: "image",
    image: {
      link: message.imageUrl,
      ...(message.caption ? { caption: message.caption } : {}),
    },
  });
}

async function sendWhatsAppMessage(
  env: ApiBindings,
  payload: { to: string } & Record<string, unknown>,
): Promise<OutboundMessageResult> {
  const version = env.META_GRAPH_API_VERSION ?? "v22.0";
  const url = `https://graph.facebook.com/${version}/${env.META_PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json().catch(() => ({}))) as WhatsAppSendTextResponse;

  if (!response.ok) {
    console.error("whatsapp.message.outbound_failed", {
      status: response.status,
      body,
    });
    return {
      providerMessageId: body.messages?.[0]?.id,
      raw: body,
    };
  }

  console.info("whatsapp.message.outbound_sent", {
    to: payload.to,
    providerMessageId: body.messages?.[0]?.id,
  });

  return {
    providerMessageId: body.messages?.[0]?.id,
    raw: body,
  };
}
