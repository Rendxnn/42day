import { Hono } from "hono";
import type { Menu, MenuItem, TodayMenuPayload } from "@42day/types";
import type { ApiBindings } from "../../../lib/bindings";
import { createSupabaseRestClient } from "../../../lib/supabase-rest";
import type { DashboardVariables, LocationRow, MenuItemRow, MenuRow, ProductRow } from "../types";
import {
  findOrCreateTodayMenu,
  getNextMenuSortOrder,
  mapLocation,
  mapMenu,
  mapMenuItem,
  mapProduct,
  resolveBusinessDate,
  selectProductOptions,
  selectProducts,
} from "../router";

export const menuDashboardRoutes = new Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>();

menuDashboardRoutes.get("/:tenantSlug/menu/today", async (c) => {
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

menuDashboardRoutes.post("/:tenantSlug/menu/today/items", async (c) => {
  const tenant = c.get("tenant");
  const supabase = createSupabaseRestClient(c.env);
  const body = await c.req.json<{ productId: string; date?: string }>();
  const menu = await findOrCreateTodayMenu(supabase, tenant.schema_name, tenant.timezone, body.date);
  const nextSortOrder = await getNextMenuSortOrder(supabase, tenant.schema_name, menu.id);
  const [product] = await selectProducts(supabase, tenant.schema_name, {
    id: `eq.${body.productId}`,
    is_active: "eq.true",
    limit: 1,
  });

  if (!product) {
    return c.json({ error: "product_not_found" }, 404);
  }

  const [item] = await supabase.insertReturning<MenuItemRow>({
    schema: tenant.schema_name,
    table: "menu_items",
    rows: {
      menu_id: menu.id,
      product_id: product.id,
      display_name: product.name,
      price_override: product.base_price,
      is_available: true,
      sort_order: nextSortOrder,
    },
  });

  if (!item) {
    return c.json({ error: "menu_item_create_failed" }, 500);
  }

  return c.json(mapMenuItem(item, mapProduct(product)), 201);
});

menuDashboardRoutes.patch("/:tenantSlug/menu/today/items/:itemId", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json<Partial<MenuItem>>();
  const [item] = await createSupabaseRestClient(c.env).updateReturning<MenuItemRow>({
    schema: tenant.schema_name,
    table: "menu_items",
    query: { id: `eq.${c.req.param("itemId")}` },
    patch: {
      ...(body.displayName !== undefined ? { display_name: body.displayName } : {}),
      ...(body.priceOverride !== undefined ? { price_override: body.priceOverride } : {}),
      ...(body.availableQuantity !== undefined ? { available_quantity: body.availableQuantity } : {}),
      ...(body.isAvailable !== undefined ? { is_available: body.isAvailable } : {}),
      ...(body.sortOrder !== undefined ? { sort_order: body.sortOrder } : {}),
    },
  });

  if (!item) {
    return c.json({ error: "menu_item_not_found" }, 404);
  }

  return c.json(mapMenuItem(item));
});

menuDashboardRoutes.delete("/:tenantSlug/menu/today/items/:itemId", async (c) => {
  const tenant = c.get("tenant");
  await createSupabaseRestClient(c.env).delete({
    schema: tenant.schema_name,
    table: "menu_items",
    query: { id: `eq.${c.req.param("itemId")}` },
  });

  return c.json({ ok: true });
});
