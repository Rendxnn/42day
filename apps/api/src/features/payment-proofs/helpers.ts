import type { NormalizedInboundMessage } from "@42day/types";

export function isTransferProofMediaMessage(message: Pick<NormalizedInboundMessage, "type" | "mediaId">): boolean {
  return Boolean(message.mediaId && (message.type === "image" || message.type === "document"));
}

export function isTransferProofUnsupportedMessage(message: Pick<NormalizedInboundMessage, "type">): boolean {
  return message.type === "audio";
}

export function looksLikeTransferProofNotice(text: string | undefined): boolean {
  const normalized = normalizeText(text);
  return ["comprobante", "ya pague", "pago listo", "ya transferi", "te transferi"].includes(normalized);
}

export function buildPaymentProofStoragePath(input: {
  tenantSlug: string;
  orderId: string;
  messageId: string;
  createdAt?: Date;
  mimeType?: string;
  filename?: string;
  messageType: NormalizedInboundMessage["type"];
}): string {
  const date = input.createdAt ?? new Date();
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const extension = resolvePaymentProofExtension({
    mimeType: input.mimeType,
    filename: input.filename,
    messageType: input.messageType,
  });

  return `tenant_${input.tenantSlug}/${year}/${month}/${input.orderId}/${input.messageId}.${extension}`;
}

export function resolvePaymentProofExtension(input: {
  mimeType?: string;
  filename?: string;
  messageType: NormalizedInboundMessage["type"];
}): string {
  const fromFilename = extractExtension(input.filename);
  if (fromFilename) {
    return fromFilename;
  }

  const normalizedMimeType = normalizeText(input.mimeType);
  if (normalizedMimeType.includes("pdf")) {
    return "pdf";
  }
  if (normalizedMimeType.includes("png")) {
    return "png";
  }
  if (normalizedMimeType.includes("jpeg") || normalizedMimeType.includes("jpg")) {
    return "jpg";
  }
  if (normalizedMimeType.includes("webp")) {
    return "webp";
  }

  return input.messageType === "document" ? "pdf" : "jpg";
}

function extractExtension(filename: string | undefined): string | undefined {
  if (!filename) {
    return undefined;
  }

  const parts = filename.toLowerCase().split(".");
  const extension = parts[parts.length - 1];
  return extension && /^[a-z0-9]{2,5}$/.test(extension) ? extension : undefined;
}

function normalizeText(text: string | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
