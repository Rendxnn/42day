import { Hono } from "hono";
import { healthRoutes } from "./routes/health";
import { whatsappRoutes } from "./routes/whatsapp";
import type { ApiBindings } from "./lib/bindings";

const app = new Hono<{ Bindings: ApiBindings }>();

app.route("/health", healthRoutes);
app.route("/webhooks/whatsapp", whatsappRoutes);

app.notFound((c) => {
  return c.json({ error: "not_found" }, 404);
});

app.onError((error, c) => {
  console.error("api.unhandled_error", {
    message: error.message,
    stack: error.stack,
  });

  return c.json({ error: "internal_server_error" }, 500);
});

export default app;
