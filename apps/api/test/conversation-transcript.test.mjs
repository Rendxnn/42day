import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  mapConversationTranscriptMessage,
  parseTranscriptLimit,
} from "../src/features/dashboard/support/conversation-transcript.ts";

const routePath = new URL(
  "../src/features/dashboard/routes/conversations.ts",
  import.meta.url,
);
const supportPath = new URL(
  "../src/features/dashboard/support/conversation-transcript.ts",
  import.meta.url,
);

test("el historial conserva el texto exacto y solo expone campos seguros", () => {
  const message = mapConversationTranscriptMessage({
    id: "message-1",
    direction: "outbound",
    message_type: "text",
    text: "Primera linea\nSegunda línea 😊",
    status: "sent",
    created_at: "2026-07-24T07:10:00.000Z",
  });

  assert.deepEqual(message, {
    id: "message-1",
    direction: "outbound",
    messageType: "text",
    text: "Primera linea\nSegunda línea 😊",
    status: "sent",
    createdAt: "2026-07-24T07:10:00.000Z",
  });
  assert.equal("payload" in message, false);
  assert.equal("providerMessageId" in message, false);
});

test("el limite del historial tiene un valor útil y un máximo seguro", () => {
  assert.equal(parseTranscriptLimit(), 300);
  assert.equal(parseTranscriptLimit("0"), 300);
  assert.equal(parseTranscriptLimit("120"), 120);
  assert.equal(parseTranscriptLimit("800"), 500);
});

test("la ruta valida la conversación, trae los mensajes recientes y los ordena cronológicamente", async () => {
  const [source, support] = await Promise.all([
    readFile(routePath, "utf8"),
    readFile(supportPath, "utf8"),
  ]);

  assert.match(source, /conversations\/:conversationId\/messages/);
  assert.match(source, /table: "conversations"/);
  assert.match(source, /table: "messages"/);
  assert.match(source, /select: "id,direction,message_type,text,status,created_at"/);
  assert.match(source, /order: "created_at\.desc,id\.desc"/);
  assert.match(source, /\.slice\(0, limit\)\s*\.reverse\(\)/);
  assert.doesNotMatch(source, /select: "[^"]*payload/);
  assert.match(support, /mapConversationTranscriptMessage/);
});
