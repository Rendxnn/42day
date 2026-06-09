import { Hono } from "hono";
import type { ApiBindings } from "../../../lib/bindings";
import { createSupabaseRestClient } from "../../../lib/supabase-rest";
import { isMissingTableError } from "../../../shared/errors/supabase";
import type { DashboardVariables, AlertRow } from "../types";
import { mapAlert, selectAlerts } from "../router";

export const alertsDashboardRoutes = new Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>();

alertsDashboardRoutes.get("/:tenantSlug/alerts", async (c) => {
  const tenant = c.get("tenant");
  let alerts: AlertRow[] = [];

  try {
    alerts = await selectAlerts(createSupabaseRestClient(c.env), tenant.schema_name, {
      status: c.req.query("status") as AlertRow["status"] | undefined,
      limit: 200,
    });
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  return c.json(alerts.map(mapAlert));
});

alertsDashboardRoutes.patch("/:tenantSlug/alerts/:alertId/acknowledge", async (c) => {
  const tenant = c.get("tenant");
  let alert: AlertRow | undefined;

  try {
    [alert] = await createSupabaseRestClient(c.env).updateReturning<AlertRow>({
      schema: tenant.schema_name,
      table: "human_intervention_alerts",
      query: {
        id: `eq.${c.req.param("alertId")}`,
      },
      patch: {
        status: "acknowledged",
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return c.json({ error: "order_module_unavailable" }, 404);
    }

    throw error;
  }

  if (!alert) {
    return c.json({ error: "alert_not_found" }, 404);
  }

  return c.json(mapAlert(alert));
});

alertsDashboardRoutes.patch("/:tenantSlug/alerts/:alertId/resolve", async (c) => {
  const tenant = c.get("tenant");
  let alert: AlertRow | undefined;

  try {
    [alert] = await createSupabaseRestClient(c.env).updateReturning<AlertRow>({
      schema: tenant.schema_name,
      table: "human_intervention_alerts",
      query: {
        id: `eq.${c.req.param("alertId")}`,
      },
      patch: {
        status: "resolved",
        resolved_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return c.json({ error: "order_module_unavailable" }, 404);
    }

    throw error;
  }

  if (!alert) {
    return c.json({ error: "alert_not_found" }, 404);
  }

  return c.json(mapAlert(alert));
});
