import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPaymentProofStoragePath,
  isTransferProofMediaMessage,
  isTransferProofUnsupportedMessage,
  looksLikeTransferProofNotice,
} from "../src/features/payment-proofs/helpers.ts";

test("detecta media real de comprobante", () => {
  assert.equal(isTransferProofMediaMessage({ type: "image", mediaId: "media-1" }), true);
  assert.equal(isTransferProofMediaMessage({ type: "document", mediaId: "media-2" }), true);
  assert.equal(isTransferProofMediaMessage({ type: "image" }), false);
  assert.equal(isTransferProofMediaMessage({ type: "text", mediaId: "media-3" }), false);
});

test("detecta formatos no soportados para comprobante", () => {
  assert.equal(isTransferProofUnsupportedMessage({ type: "audio" }), true);
  assert.equal(isTransferProofUnsupportedMessage({ type: "image" }), false);
});

test("solo detecta avisos textuales de pago cerrados", () => {
  assert.equal(looksLikeTransferProofNotice("ya pagué"), true);
  assert.equal(looksLikeTransferProofNotice("comprobante"), true);
  assert.equal(looksLikeTransferProofNotice("ya pagué por transferencia"), false);
  assert.equal(looksLikeTransferProofNotice("te mandé el comprobante"), false);
  assert.equal(looksLikeTransferProofNotice("hola quiero el menú"), false);
});

test("construye storage path esperado para comprobantes", () => {
  const path = buildPaymentProofStoragePath({
    tenantSlug: "arepas",
    orderId: "order-123",
    messageId: "message-456",
    createdAt: new Date("2026-06-08T10:30:00.000Z"),
    mimeType: "application/pdf",
    filename: "comprobante.pdf",
    messageType: "document",
  });

  assert.equal(path, "tenant_arepas/2026/06/order-123/message-456.pdf");
});
