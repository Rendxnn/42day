import { Hono } from "hono";
import { cors } from "hono/cors";
import { dashboardRoutes } from "./features/dashboard/router.ts";
import { healthRoutes } from "./routes/health.ts";
import { whatsappRoutes } from "./routes/whatsapp.ts";
import type { ApiBindings } from "./lib/bindings.ts";
import { SupabaseRestError } from "./lib/supabase-rest.ts";

const app = new Hono<{ Bindings: ApiBindings }>();

const localDashboardOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5175",
];

function resolveDashboardOrigins(env: ApiBindings) {
  const configuredOrigins = (env.DASHBOARD_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([...localDashboardOrigins, ...configuredOrigins]);
}

app.use(
  "/dashboard/*",
  cors({
    origin: (origin, c) => {
      if (!origin) return "";
      return resolveDashboardOrigins(c.env).has(origin) ? origin : "";
    },
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
    maxAge: 86400,
  }),
);

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

  if (error instanceof SupabaseRestError) {
    return c.json(
      {
        error: "supabase_rest_error",
        operation: error.message,
        supabaseStatus: error.status,
      },
      502,
    );
  }

  return c.json({ error: "internal_server_error" }, 500);
});

export default app;
