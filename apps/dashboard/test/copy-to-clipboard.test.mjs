import assert from "node:assert/strict";
import test from "node:test";
import { copyTextToClipboard } from "../src/features/admin/copyToClipboard.ts";

test("clipboard receives the permanent NFC URL byte for byte and makes no API mutation", async () => {
  const writes = [];
  const permanentUrl = "https://go.thaledon.com/r/000000000991";
  await copyTextToClipboard(permanentUrl, { writeText: async (value) => writes.push(value) });
  assert.deepEqual(writes, [permanentUrl]);
});

test("clipboard failures remain rejectable for the UI's manual-copy fallback", async () => {
  await assert.rejects(
    copyTextToClipboard("https://go.thaledon.com/r/000000000991", {
      writeText: async () => { throw new Error("clipboard denied"); },
    }),
    /clipboard denied/,
  );
});
