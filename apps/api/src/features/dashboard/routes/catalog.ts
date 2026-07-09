import { Hono } from "hono";
import type { Product } from "@42day/types";
import type { ApiBindings } from "../../../lib/bindings";
import { createSupabaseRestClient, SupabaseRestError } from "../../../lib/supabase-rest";
import type { DashboardVariables, ProductRow } from "../types";
import { replaceProductOptions, selectProductOptions } from "../support/catalog";
import { mapProduct } from "../support/mappers";

export const catalogDashboardRoutes = new Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>();

catalogDashboardRoutes.post("/:tenantSlug/products", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json<Partial<Product>>();
  const supabase = createSupabaseRestClient(c.env);
  const rows = {
    name: body.name,
    description: body.description ?? null,
    base_price: body.basePrice ?? 0,
    category: body.category ?? null,
    emoji: body.emoji ?? null,
    product_type: body.productType ?? "simple",
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
    if (error instanceof SupabaseRestError && error.status === 400 && (error.body.includes("image_url") || error.body.includes("emoji"))) {
      const { emoji: _emoji, image_url: _imageUrl, ...rowsWithoutOptionalVisuals } = rows;
      productRows = await supabase.insertReturning<ProductRow>({
        schema: tenant.schema_name,
        table: "products",
        rows: rowsWithoutOptionalVisuals,
      });
    } else {
      throw error;
    }
  }

  const [product] = productRows;

  if (!product) {
    return c.json({ error: "product_create_failed" }, 500);
  }

  await replaceProductOptions(supabase, tenant.schema_name, product.id, body.productType === "composite" ? body.options ?? [] : []);
  const options = await selectProductOptions(supabase, tenant.schema_name, [product.id]);

  return c.json(mapProduct(product, options.get(product.id)), 201);
});

catalogDashboardRoutes.patch("/:tenantSlug/products/:productId", async (c) => {
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
      ...(body.emoji !== undefined ? { emoji: body.emoji } : {}),
      ...(body.productType !== undefined ? { product_type: body.productType } : {}),
      ...(body.imageUrl !== undefined ? { image_url: body.imageUrl } : {}),
      ...(body.isActive !== undefined ? { is_active: body.isActive } : {}),
      updated_at: new Date().toISOString(),
    },
  });

  if (!product) {
    return c.json({ error: "product_not_found" }, 404);
  }

  if (body.productType !== undefined || body.options !== undefined) {
    await replaceProductOptions(createSupabaseRestClient(c.env), tenant.schema_name, product.id, body.productType === "composite" ? body.options ?? [] : []);
  }

  const options = await selectProductOptions(createSupabaseRestClient(c.env), tenant.schema_name, [product.id]);

  return c.json(mapProduct(product, options.get(product.id)));
});

catalogDashboardRoutes.delete("/:tenantSlug/products/:productId", async (c) => {
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
