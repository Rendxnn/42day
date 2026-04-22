import { Hono } from "hono";
import type { ApiBindings } from "../lib/bindings";

export const healthRoutes = new Hono<{ Bindings: ApiBindings }>();

healthRoutes.get("/", (c) => {
  return c.json({
    ok: true,
    service: "42day-api",
    env: c.env.APP_ENV ?? "unknown",
  });
});
