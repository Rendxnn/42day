import type { Hono } from "hono";
import type { TodayMenuPayload } from "@42day/types";
import { createSupabaseRestClient } from "../../../../lib/supabase-rest";
import type { ApiBindings } from "../../../../lib/bindings";
import { mapLocation, mapMenu, mapMenuItem, mapProduct } from "../../support/mappers";
import { resolveBusinessDate } from "../../support/date";
import { selectProductOptions, selectProducts } from "../../support/catalog";
import type { DashboardVariables, LocationRow, MenuItemRow, MenuRow } from "../../types";

export function registerOrdersMenuTodayRoute(routes: Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>) {
  routes.get("/:tenantSlug/menu/today", async (c) => {
    const tenant = c.get("tenant");
    const supabase = createSupabaseRestClient(c.env);
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
            limit: 1,
          },
        })
      : [];

    const products = await selectProducts(supabase, tenant.schema_name);
    const productOptions = await selectProductOptions(supabase, tenant.schema_name, products.map((product) => product.id));

    const itemRows = menu
      ? await supabase.select<MenuItemRow>({
          schema: tenant.schema_name,
          table: "menu_items",
          query: {
            select: "id,menu_id,product_id,combo_id,display_name,price_override,available_quantity,is_available,sort_order",
            menu_id: `eq.${menu.id}`,
            order: "sort_order.asc",
          },
        })
      : [];

    const productById = new Map(products.map((product) => [product.id, mapProduct(product, productOptions.get(product.id))]));
    const payload: TodayMenuPayload = {
      tenantSlug: tenant.slug,
      tenantSchema: tenant.schema_name,
      location: location ? mapLocation(location) : undefined,
      menu: menu ? mapMenu(menu) : undefined,
      items: itemRows.map((item) => mapMenuItem(item, productById.get(item.product_id ?? ""))),
      products: products.map((product) => mapProduct(product, productOptions.get(product.id))),
    };

    return c.json(payload);
  });
}
