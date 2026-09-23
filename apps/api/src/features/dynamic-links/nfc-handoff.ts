import type { NfcHandoffResponse } from "@42day/types";

export const NFC_COOL_SHORTCUT_NAME = "Escribir NFC ParaHoy" as const;
export const NFC_COOL_SETUP_URL = "https://nfc.cool/developers/" as const;

export class NfcHandoffError extends Error {
  constructor() {
    super("nfc_handoff_failed");
  }
}

export function createActiveNfcHandoff(publicUrl: string): NfcHandoffResponse {
  return {
    provider: "nfc_cool",
    handoffUrl: createNfcCoolHandoffUrl(publicUrl),
    shortcutName: NFC_COOL_SHORTCUT_NAME,
    setupUrl: NFC_COOL_SETUP_URL,
  };
}

export function createNfcCoolHandoffUrl(publicUrl: string) {
  const url = parsePermanentUrl(publicUrl);
  const query = new URLSearchParams({
    name: NFC_COOL_SHORTCUT_NAME,
    input: "text",
    text: url,
  });
  return `shortcuts://run-shortcut?${query.toString()}`;
}

/**
 * Legacy-only adapter kept for callbacks emitted before NFC.cool became active.
 * Do not expose this from new dashboard actions without a new physical validation feature.
 */
export function createLegacyNfcHelperHandoffUrl(publicUrl: string, callbackUrl: string) {
  return `nfchelper://write?url=${encodeURIComponent(parsePermanentUrl(publicUrl))}&callback=${encodeURIComponent(parseCallbackUrl(callbackUrl))}`;
}

function parsePermanentUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname) throw new Error("invalid");
    return url.toString();
  } catch {
    throw new NfcHandoffError();
  }
}

function parseCallbackUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname) throw new Error("invalid");
    return url.toString();
  } catch {
    throw new NfcHandoffError();
  }
}
