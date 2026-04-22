import { Hono } from "hono";
import { verifyWhatsAppWebhook } from "../modules/whatsapp-webhook/verify";
import { handleWhatsAppWebhook } from "../modules/whatsapp-webhook/handler";
import type { ApiBindings } from "../lib/bindings";

export const whatsappRoutes = new Hono<{ Bindings: ApiBindings }>();

whatsappRoutes.get("/", (c) => {
  const result = verifyWhatsAppWebhook({
    mode: c.req.query("hub.mode"),
    challenge: c.req.query("hub.challenge"),
    verifyToken: c.req.query("hub.verify_token"),
    expectedVerifyToken: c.env.META_VERIFY_TOKEN,
  });

  if (!result.ok) {
    return c.text("Forbidden", 403);
  }

  return c.text(result.challenge);
});

whatsappRoutes.post("/", async (c) => {
  const payload = await c.req.json().catch(() => null);

  if (!payload) {
    return c.json({ error: "invalid_json" }, 400);
  }

  await handleWhatsAppWebhook({
    env: c.env,
    payload,
  });

  return c.json({ ok: true });
});
