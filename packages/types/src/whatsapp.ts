export type WhatsAppMessageType =
  | "text"
  | "button"
  | "interactive"
  | "image"
  | "document"
  | "audio"
  | "location"
  | "unknown";

export type NormalizedWhatsAppLocation = {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
};

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
  location?: NormalizedWhatsAppLocation;
  raw: unknown;
};

export type OutboundTextMessage = {
  to: string;
  text: string;
};

export type OutboundMessageResult = {
  providerMessageId?: string;
  raw: unknown;
};
