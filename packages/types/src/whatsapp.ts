export type WhatsAppMessageType =
  | "text"
  | "button"
  | "interactive"
  | "image"
  | "document"
  | "audio"
  | "unknown";

export type NormalizedInboundMessage = {
  provider: "whatsapp_cloud";
  providerMessageId: string;
  phoneNumberId: string;
  wabaId?: string;
  from: string;
  timestamp?: string;
  type: WhatsAppMessageType;
  text?: string;
  mediaId?: string;
  raw: unknown;
};

export type OutboundTextMessage = {
  to: string;
  text: string;
};
