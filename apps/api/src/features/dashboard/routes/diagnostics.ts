import { Hono } from "hono";
import type { ApiBindings } from "../../../lib/bindings";
import { createSupabaseRestClient } from "../../../lib/supabase-rest";
import type { DashboardVariables, ProductRow } from "../types";

export const diagnosticsDashboardRoutes = new Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>();

diagnosticsDashboardRoutes.get("/:tenantSlug/diagnostics", async (c) => {
  const tenant = c.get("tenant");
  const supabase = createSupabaseRestClient(c.env);
  const checks: Record<string, boolean | string> = {
    tenant: tenant.slug,
    schema: tenant.schema_name,
    productsTable: false,
    productImageColumn: false,
    productImagesBucket: false,
  };

  try {
    await supabase.select<ProductRow>({
      schema: tenant.schema_name,
      table: "products",
      query: {
        select: "id",
        limit: 1,
      },
    });
    checks.productsTable = true;
  } catch {
    checks.productsTable = false;
  }

  try {
    await supabase.select<ProductRow>({
      schema: tenant.schema_name,
      table: "products",
      query: {
        select: "image_url",
        limit: 1,
      },
    });
    checks.productImageColumn = true;
  } catch {
    checks.productImageColumn = false;
  }

  const bucketResponse = await fetch(`${c.env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/bucket/product-images`, {
    headers: {
      apikey: c.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  checks.productImagesBucket = bucketResponse.ok;

  return c.json(checks);
});
