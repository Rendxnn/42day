import { Hono } from "hono";
import type { Menu, MenuItem, Product, TodayMenuPayload } from "@42day/types";
import type { ApiBindings } from "../lib/bindings";
import { createSupabaseRestClient, SupabaseRestError } from "../lib/supabase-rest";

type TenantRow = {
  id: string;
  slug: string;
  schema_name: string;
  timezone?: string;
};

type LocationRow = {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  delivery_fee_fixed: number;
  is_active: boolean;
};

type ProductRow = {
  id: string;
  name: string;
  description?: string;
  base_price: number;
  category?: string;
  image_url?: string;
  is_active: boolean;
};

type MenuRow = {
  id: string;
  location_id: string;
  date: string;
  name: string;
  status: Menu["status"];
  published_at?: string;
};

type MenuItemRow = {
  id: string;
  menu_id: string;
  product_id?: string;
  combo_id?: string;
  display_name?: string;
  price_override?: number;
  available_quantity?: number;
  is_available: boolean;
  sort_order: number;
};

type DashboardVariables = {
  tenant: TenantRow;
};

export const dashboardRoutes = new Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>();

dashboardRoutes.get("/tenants", async (c) => {
  const tenants = await createSupabaseRestClient(c.env).select<TenantRow & { name: string }>({
    schema: "control",
    table: "tenants",
    query: {
      select: "id,name,slug,schema_name",
      status: "eq.active",
      order: "name.asc",
    },
  });

  return c.json(
    tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      schemaName: tenant.schema_name,
    })),
  );
});

dashboardRoutes.use("/:tenantSlug/*", async (c, next) => {
  const supabase = createSupabaseRestClient(c.env);
  const [tenant] = await supabase.select<TenantRow>({
    schema: "control",
    table: "tenants",
    query: {
      select: "id,slug,schema_name,timezone",
      slug: `eq.${c.req.param("tenantSlug")}`,
      status: "eq.active",
      limit: 1,
    },
  });

  if (!tenant) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  c.set("tenant", tenant);
  await next();
});

dashboardRoutes.get("/:tenantSlug/menu/today", async (c) => {
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

  const productById = new Map(products.map((product) => [product.id, mapProduct(product)]));
  const payload: TodayMenuPayload = {
    tenantSlug: tenant.slug,
    tenantSchema: tenant.schema_name,
    location: location ? mapLocation(location) : undefined,
    menu: menu ? mapMenu(menu) : undefined,
    items: itemRows.map((item) => mapMenuItem(item, productById.get(item.product_id ?? ""))),
    products: products.map(mapProduct),
  };

  return c.json(payload);
});

dashboardRoutes.post("/:tenantSlug/products", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json<Partial<Product>>();
  const supabase = createSupabaseRestClient(c.env);
  const rows = {
    name: body.name,
    description: body.description ?? null,
    base_price: body.basePrice ?? 0,
    category: body.category ?? null,
    ...(body.imageUrl !== undefined ? { image_url: body.imageUrl } : {}),
    is_active: body.isActive ?? true,
  };
  let productRows: ProductRow[];

  try {
    productRows = await supabase.insertReturning<ProductRow>({
      schema: tenant.schema_name,
      table: "products",
      rows,
    });
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 400 && error.body.includes("image_url")) {
      const { image_url: _imageUrl, ...rowsWithoutImage } = rows;
      productRows = await supabase.insertReturning<ProductRow>({
        schema: tenant.schema_name,
        table: "products",
        rows: rowsWithoutImage,
      });
    } else {
      throw error;
    }
  }

  const [product] = productRows;

  if (!product) {
    return c.json({ error: "product_create_failed" }, 500);
  }

  return c.json(mapProduct(product), 201);
});

dashboardRoutes.post("/:tenantSlug/uploads/product-image", async (c) => {
  const tenant = c.get("tenant");
  const form = await c.req.parseBody();
  const file = form.file;

  if (!(file instanceof File)) {
    return c.json({ error: "image_file_required" }, 400);
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return c.json({ error: "unsupported_image_type" }, 400);
  }

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `${tenant.slug}/products/${crypto.randomUUID()}.${extension}`;
  const upload = await createSupabaseRestClient(c.env).uploadObject({
    bucket: "product-images",
    path: storagePath,
    body: file,
    contentType: file.type,
  });

  return c.json({
    bucket: "product-images",
    path: upload.path,
    publicUrl: upload.publicUrl,
  });
});

dashboardRoutes.patch("/:tenantSlug/products/:productId", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json<Partial<Product>>();
  const [product] = await createSupabaseRestClient(c.env).updateReturning<ProductRow>({
    schema: tenant.schema_name,
    table: "products",
    query: { id: `eq.${c.req.param("productId")}` },
    patch: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.basePrice !== undefined ? { base_price: body.basePrice } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(body.imageUrl !== undefined ? { image_url: body.imageUrl } : {}),
      ...(body.isActive !== undefined ? { is_active: body.isActive } : {}),
      updated_at: new Date().toISOString(),
    },
  });

  if (!product) {
    return c.json({ error: "product_not_found" }, 404);
  }

  return c.json(mapProduct(product));
});

dashboardRoutes.get("/:tenantSlug/diagnostics", async (c) => {
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

dashboardRoutes.delete("/:tenantSlug/products/:productId", async (c) => {
  const tenant = c.get("tenant");
  await createSupabaseRestClient(c.env).updateReturning<ProductRow>({
    schema: tenant.schema_name,
    table: "products",
    query: { id: `eq.${c.req.param("productId")}` },
    patch: {
      is_active: false,
      updated_at: new Date().toISOString(),
    },
  });

  return c.json({ ok: true });
});

dashboardRoutes.post("/:tenantSlug/menu/today/items", async (c) => {
  const tenant = c.get("tenant");
  const supabase = createSupabaseRestClient(c.env);
  const body = await c.req.json<{ productId: string; date?: string }>();
  const menu = await findOrCreateTodayMenu(supabase, tenant.schema_name, tenant.timezone, body.date);
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
      sort_order: Date.now(),
    },
  });

  if (!item) {
    return c.json({ error: "menu_item_create_failed" }, 500);
  }

  return c.json(mapMenuItem(item, mapProduct(product)), 201);
});

dashboardRoutes.patch("/:tenantSlug/menu/today/items/:itemId", async (c) => {
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

dashboardRoutes.delete("/:tenantSlug/menu/today/items/:itemId", async (c) => {
  const tenant = c.get("tenant");
  await createSupabaseRestClient(c.env).delete({
    schema: tenant.schema_name,
    table: "menu_items",
    query: { id: `eq.${c.req.param("itemId")}` },
  });

  return c.json({ ok: true });
});

async function findOrCreateTodayMenu(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  timezone?: string,
  requestedDate?: string,
): Promise<MenuRow> {
  const date = resolveBusinessDate(requestedDate, timezone);
  const [location] = await supabase.select<LocationRow>({
    schema,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  if (!location) {
    throw new Error("active_location_not_found");
  }

  const [existing] = await supabase.select<MenuRow>({
    schema,
    table: "menus",
    query: {
      select: "id,location_id,date,name,status,published_at",
      location_id: `eq.${location.id}`,
      date: `eq.${date}`,
      limit: 1,
    },
  });

  if (existing) {
    return existing;
  }

  const [menu] = await supabase.insertReturning<MenuRow>({
    schema,
    table: "menus",
    rows: {
      location_id: location.id,
      date,
      name: "Menu de hoy",
      status: "published",
      published_at: new Date().toISOString(),
    },
  });

  if (!menu) {
    throw new Error("menu_create_failed");
  }

  return menu;
}

async function selectProducts(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  query: Record<string, string | number | boolean | undefined> = {},
): Promise<ProductRow[]> {
  try {
    return await supabase.select<ProductRow>({
      schema,
      table: "products",
      query: {
          select: "id,name,description,base_price,category,image_url,is_active",
          order: "name.asc",
          is_active: "eq.true",
          ...query,
      },
    });
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 400 && error.body.includes("image_url")) {
      return supabase.select<ProductRow>({
        schema,
        table: "products",
        query: {
          select: "id,name,description,base_price,category,is_active",
          order: "name.asc",
          is_active: "eq.true",
          ...query,
        },
      });
    }

    throw error;
  }
}

function mapLocation(row: LocationRow) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    deliveryFeeFixed: row.delivery_fee_fixed,
    isActive: row.is_active,
  };
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    basePrice: row.base_price,
    category: row.category,
    imageUrl: row.image_url,
    isActive: row.is_active,
  };
}

function mapMenu(row: MenuRow): Menu {
  return {
    id: row.id,
    locationId: row.location_id,
    date: row.date,
    name: row.name,
    status: row.status,
    publishedAt: row.published_at,
  };
}

function mapMenuItem(row: MenuItemRow, product?: Product): MenuItem {
  return {
    id: row.id,
    menuId: row.menu_id,
    productId: row.product_id,
    comboId: row.combo_id,
    displayName: row.display_name,
    priceOverride: row.price_override,
    availableQuantity: row.available_quantity,
    isAvailable: row.is_available,
    sortOrder: row.sort_order,
    product,
  };
}

function resolveBusinessDate(requestedDate?: string, timezone = "America/Bogota"): string {
  if (requestedDate) {
    return requestedDate;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date().toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}
