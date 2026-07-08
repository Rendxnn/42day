import { Hono } from "hono";
import type { AutomationSettings } from "@42day/types";
import type { ApiBindings } from "../../../lib/bindings";
import { createSupabaseRestClient } from "../../../lib/supabase-rest";
import type { DashboardVariables, LocationRow, TenantRow } from "../types";
import {
  getDeliveryCoverageSettings,
  parseDeliveryCoverageSettingsUpdate,
} from "../../delivery-coverage/service";

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

settingsDashboardRoutes.get("/:tenantSlug/settings/delivery-coverage", async (c) => {
  const tenant = c.get("tenant");
  const settings = await getDeliveryCoverageSettings({
    env: c.env,
    schemaName: tenant.schema_name,
  });

  return settings
    ? c.json(settings)
    : c.json({ error: "active_location_not_found" }, 404);
});

settingsDashboardRoutes.patch("/:tenantSlug/settings/delivery-coverage", async (c) => {
  const tenant = c.get("tenant");
  const body = parseDeliveryCoverageSettingsUpdate(await c.req.json().catch(() => undefined));
  if (!body) {
    return c.json({ error: "invalid_delivery_coverage_settings" }, 400);
  }

  const current = await getDeliveryCoverageSettings({
    env: c.env,
    schemaName: tenant.schema_name,
  });
  if (!current) {
    return c.json({ error: "active_location_not_found" }, 404);
  }

  await createSupabaseRestClient(c.env).update({
    schema: tenant.schema_name,
    table: "locations",
    values: {
      delivery_enabled: body.deliveryEnabled,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      restaurant_city: body.restaurantCity ?? null,
      restaurant_department: body.restaurantDepartment ?? null,
      restaurant_country: body.restaurantCountry,
      delivery_radius_km: body.deliveryRadiusKm,
      allow_written_address_reference: body.allowWrittenAddressReference,
      try_geocode_written_addresses: body.tryGeocodeWrittenAddresses,
      allow_out_of_coverage_orders: body.allowOutOfCoverageOrders,
      request_location_message: body.requestLocationMessage,
      written_address_fallback_message: body.writtenAddressFallbackMessage,
      out_of_coverage_message: body.outOfCoverageMessage,
      updated_at: new Date().toISOString(),
    },
    query: { id: `eq.${current.locationId}` },
  });

  const updated = await getDeliveryCoverageSettings({
    env: c.env,
    schemaName: tenant.schema_name,
    locationId: current.locationId,
  });
  return c.json(updated);
});
