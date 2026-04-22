export type VerifyWhatsAppWebhookInput = {
  mode?: string;
  challenge?: string;
  verifyToken?: string;
  expectedVerifyToken: string;
};

export type VerifyWhatsAppWebhookResult =
  | { ok: true; challenge: string }
  | { ok: false; reason: "invalid_mode" | "missing_challenge" | "invalid_token" };

export function verifyWhatsAppWebhook(input: VerifyWhatsAppWebhookInput): VerifyWhatsAppWebhookResult {
  if (input.mode !== "subscribe") {
    return { ok: false, reason: "invalid_mode" };
  }

  if (!input.challenge) {
    return { ok: false, reason: "missing_challenge" };
  }

  if (input.verifyToken !== input.expectedVerifyToken) {
    return { ok: false, reason: "invalid_token" };
  }

  return { ok: true, challenge: input.challenge };
}
