import { Hono } from "hono";
import type { PublicCartaPayload } from "@42day/types";
import type { ApiBindings } from "../../../lib/bindings";
import { createSupabaseRestClient } from "../../../lib/supabase-rest";
import type {
  LocationRow,
  MenuItemRow,
  MenuRow,
  TenantRow,
  DashboardVariables,
} from "../types";
import {
  mapLocation,
  mapMenu,
  mapMenuItem,
  mapProduct,
  resolveBusinessDate,
  selectProductOptions,
  selectProducts,
} from "../router";

export const publicCartaRoutes = new Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>();

publicCartaRoutes.get("/public/:tenantSlug/carta", async (c) => {
  const supabase = createSupabaseRestClient(c.env);
  const [tenant] = await supabase.select<TenantRow>({
    schema: "control",
    table: "tenants",
    query: {
      select: "id,name,slug,schema_name,timezone",
      slug: `eq.${c.req.param("tenantSlug")}`,
      status: "eq.active",
      limit: 1,
    },
  });

  if (!tenant) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  const date = resolveBusinessDate(c.req.query("date"), tenant.timezone);
  const [location] = await supabase.select<LocationRow>({
    schema: tenant.schema_name,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  const [menu] = location
    ? await supabase.select<MenuRow>({
        schema: tenant.schema_name,
        table: "menus",
        query: {
          select: "id,location_id,date,name,status,published_at",
          location_id: `eq.${location.id}`,
          date: `eq.${date}`,
          status: "eq.published",
          limit: 1,
        },
      })
    : [];

  const itemRows = menu
    ? await supabase.select<MenuItemRow>({
        schema: tenant.schema_name,
        table: "menu_items",
        query: {
          select: "id,menu_id,product_id,combo_id,display_name,price_override,available_quantity,is_available,sort_order",
          menu_id: `eq.${menu.id}`,
          is_available: "eq.true",
          order: "sort_order.asc",
        },
      })
    : [];

  const productIds = itemRows
    .map((item) => item.product_id)
    .filter((productId): productId is string => Boolean(productId));
  const products = productIds.length > 0
    ? await selectProducts(supabase, tenant.schema_name, {
        id: `in.(${productIds.join(",")})`,
        is_active: "eq.true",
      })
    : [];
  const productOptions = await selectProductOptions(supabase, tenant.schema_name, products.map((product) => product.id));
  const productById = new Map(products.map((product) => [product.id, mapProduct(product, productOptions.get(product.id))]));

  const payload: PublicCartaPayload = {
    tenant: {
      name: tenant.name ?? tenant.slug,
      slug: tenant.slug,
    },
    requestedDate: date,
    generatedAt: new Date().toISOString(),
    location: location ? mapLocation(location) : undefined,
    menu: menu ? mapMenu(menu) : undefined,
    items: itemRows
      .map((item) => mapMenuItem(item, productById.get(item.product_id ?? "")))
      .filter((item) => item.product?.isActive !== false),
  };

  return c.json(payload);
});
