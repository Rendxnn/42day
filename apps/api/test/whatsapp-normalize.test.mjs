import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWhatsAppPayload } from "../src/modules/whatsapp-webhook/normalize.ts";

test("normaliza metadata de media en mensajes document", () => {
  const [message] = normalizeWhatsAppPayload({
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            value: {
              metadata: {
                phone_number_id: "phone-1",
              },
              messages: [
                {
                  id: "wamid-1",
                  from: "573001112233",
                  timestamp: "1710000000",
                  type: "document",
                  document: {
                    id: "media-1",
                    mime_type: "application/pdf",
                    filename: "soporte.pdf",
                    caption: "mi comprobante",
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.ok(message);
  assert.equal(message.mediaId, "media-1");
  assert.equal(message.mediaMimeType, "application/pdf");
  assert.equal(message.mediaFilename, "soporte.pdf");
  assert.equal(message.mediaCaption, "mi comprobante");
});
