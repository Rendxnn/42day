import { Hono } from "hono";
import type { AutomationSettings } from "@42day/types";
import type { ApiBindings } from "../../../lib/bindings";
import { createSupabaseRestClient } from "../../../lib/supabase-rest";
import type { DashboardVariables, LocationRow, TenantRow } from "../types";

export const settingsDashboardRoutes = new Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>();

settingsDashboardRoutes.get("/:tenantSlug/settings/automation", async (c) => {
  const tenant = c.get("tenant");
  const [location] = await createSupabaseRestClient(c.env).select<LocationRow>({
    schema: tenant.schema_name,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,automation_enabled,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  const payload: AutomationSettings = {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantAutomationEnabled: true,
    locationAutomationEnabled: location?.automation_enabled,
  };

  const [tenantRow] = await createSupabaseRestClient(c.env).select<TenantRow & { automation_enabled: boolean }>({
    schema: "control",
    table: "tenants",
    query: {
      select: "id,slug,schema_name,timezone,automation_enabled",
      id: `eq.${tenant.id}`,
      limit: 1,
    },
  });

  payload.tenantAutomationEnabled = tenantRow?.automation_enabled ?? true;

  return c.json(payload);
});

settingsDashboardRoutes.patch("/:tenantSlug/settings/automation", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json<{ enabled: boolean }>();
  const supabase = createSupabaseRestClient(c.env);
  const [location] = await supabase.select<LocationRow>({
    schema: tenant.schema_name,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,automation_enabled,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  await Promise.all([
    supabase.update({
      schema: "control",
      table: "tenants",
      values: {
        automation_enabled: body.enabled,
        updated_at: new Date().toISOString(),
      },
      query: {
        id: `eq.${tenant.id}`,
      },
    }),
    location
      ? supabase.update({
          schema: tenant.schema_name,
          table: "locations",
          values: {
            automation_enabled: body.enabled,
            updated_at: new Date().toISOString(),
          },
          query: {
            id: `eq.${location.id}`,
          },
        })
      : Promise.resolve([]),
  ]);

  return c.json({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantAutomationEnabled: body.enabled,
    locationAutomationEnabled: location ? body.enabled : undefined,
  } satisfies AutomationSettings);
});
