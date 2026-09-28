/**
 * Legacy-only adapter kept for callbacks emitted before automatic NFC handoff was disabled.
 * Do not expose this from new dashboard actions without a new physical validation feature.
 */
export function createLegacyNfcHelperHandoffUrl(publicUrl: string, callbackUrl: string) {
  return `nfchelper://write?url=${encodeURIComponent(parseHttpsUrl(publicUrl))}&callback=${encodeURIComponent(parseHttpsUrl(callbackUrl))}`;
}

export class NfcHandoffError extends Error {
  constructor() {
    super("nfc_handoff_failed");
  }
}

function parseHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname) throw new Error("invalid");
    return url.toString();
  } catch {
    throw new NfcHandoffError();
  }
}
