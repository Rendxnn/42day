import { Hono } from "hono";
import { dashboardRoutes } from "./routes/dashboard";
import { healthRoutes } from "./routes/health";
import { whatsappRoutes } from "./routes/whatsapp";
import type { ApiBindings } from "./lib/bindings";

const app = new Hono<{ Bindings: ApiBindings }>();

app.route("/dashboard", dashboardRoutes);
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

  if (
    c.env.APP_ENV === "local" &&
    (c.env.SUPABASE_URL?.includes("your-project") || c.env.SUPABASE_SERVICE_ROLE_KEY === "replace-me")
  ) {
    return c.json(
      {
        error: "supabase_not_configured",
        message: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/api/.dev.vars",
      },
      503,
    );
  }

  return c.json({ error: "internal_server_error" }, 500);
});

export default app;
