import type { Product } from "@42day/types";
import { createSupabaseRestClient, SupabaseRestError } from "../../../lib/supabase-rest.ts";
import type { LocationRow, MenuItemRow, MenuRow, ProductOptionRow, ProductOptionValueRow, ProductRow } from "../types";
import { resolveBusinessDate } from "./date.ts";

export async function findOrCreateTodayMenu(
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

export async function selectProducts(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  query: Record<string, string | number | boolean | undefined> = {},
): Promise<ProductRow[]> {
  try {
    return await supabase.select<ProductRow>({
      schema,
      table: "products",
      query: {
        select: "id,name,description,base_price,category,emoji,product_type,image_url,is_active",
        order: "name.asc",
        is_active: "eq.true",
        ...query,
      },
    });
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 400 && (error.body.includes("image_url") || error.body.includes("emoji"))) {
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

export async function getNextMenuSortOrder(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  menuId: string,
): Promise<number> {
  const [lastItem] = await supabase.select<Pick<MenuItemRow, "sort_order">>({
    schema,
    table: "menu_items",
    query: {
      select: "sort_order",
      menu_id: `eq.${menuId}`,
      order: "sort_order.desc",
      limit: 1,
    },
  });

  return (lastItem?.sort_order ?? 0) + 10;
}

export async function selectProductOptions(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  productIds: string[],
): Promise<Map<string, Product["options"]>> {
  const optionsByProductId = new Map<string, Product["options"]>();
  if (productIds.length === 0) return optionsByProductId;

  let optionRows: ProductOptionRow[] = [];

  try {
    optionRows = await supabase.select<ProductOptionRow>({
      schema,
      table: "product_options",
      query: {
        select: "id,product_id,name,description,type,is_required,min_select,max_select,sort_order,display_mode",
        product_id: `in.(${productIds.join(",")})`,
        order: "sort_order.asc",
      },
    });
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404) return optionsByProductId;
    throw error;
  }

  const optionIds = optionRows.map((option) => option.id);
  const valuesByOptionId = new Map<string, ProductOptionValueRow[]>();

  if (optionIds.length > 0) {
    const valueRows = await supabase.select<ProductOptionValueRow>({
      schema,
      table: "product_option_values",
      query: {
        select: "id,option_id,name,description,price_delta,is_active,sort_order",
        option_id: `in.(${optionIds.join(",")})`,
        order: "sort_order.asc",
      },
    });

    valueRows.forEach((value) => {
      const values = valuesByOptionId.get(value.option_id) ?? [];
      values.push(value);
      valuesByOptionId.set(value.option_id, values);
    });
  }

  optionRows.forEach((option) => {
    const values = valuesByOptionId.get(option.id) ?? [];
    const mappedOptions = optionsByProductId.get(option.product_id) ?? [];
    mappedOptions.push({
      id: option.id,
      name: option.name,
      description: option.description ?? undefined,
      type: option.type,
      isRequired: option.is_required,
      minSelect: option.min_select,
      maxSelect: option.max_select,
      sortOrder: option.sort_order ?? 0,
      displayMode: option.display_mode ?? "list",
      values: values.map((value) => ({
        id: value.id,
        name: value.name,
        description: value.description ?? undefined,
        priceDelta: value.price_delta,
        isActive: value.is_active,
        sortOrder: value.sort_order ?? 0,
      })),
    });
    optionsByProductId.set(option.product_id, mappedOptions);
  });

  return optionsByProductId;
}

export async function replaceProductOptions(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  productId: string,
  options: Product["options"] = [],
) {
  const existingOptions = await supabase.select<ProductOptionRow>({
    schema,
    table: "product_options",
    query: {
      select: "id,product_id,name,type,is_required,min_select,max_select",
      product_id: `eq.${productId}`,
    },
  });

  for (const option of existingOptions) {
    await supabase.delete({
      schema,
      table: "product_option_values",
      query: { option_id: `eq.${option.id}` },
    });
  }

  await supabase.delete({
    schema,
    table: "product_options",
    query: { product_id: `eq.${productId}` },
  });

  const optionRows = (options ?? [])
    .filter((option) => option.name.trim())
    .map((option, index) => ({
      product_id: productId,
      name: option.name.trim(),
      description: option.description?.trim() || null,
      type: option.type,
      is_required: option.isRequired,
      min_select: option.minSelect,
      max_select: option.maxSelect,
      sort_order: option.sortOrder ?? index * 10,
      display_mode: option.displayMode ?? "list",
    }));

  if (optionRows.length === 0) return;

  const insertedOptions = await supabase.insertReturning<ProductOptionRow>({
    schema,
    table: "product_options",
    rows: optionRows,
  });

  const valueRows = insertedOptions.flatMap((insertedOption, optionIndex) => {
    const sourceOption = options[optionIndex];
    return (sourceOption?.values ?? [])
      .filter((value) => value.name.trim())
      .map((value, valueIndex) => ({
        option_id: insertedOption.id,
        name: value.name.trim(),
        description: value.description?.trim() || null,
        price_delta: value.priceDelta ?? 0,
        is_active: value.isActive ?? true,
        sort_order: value.sortOrder ?? valueIndex * 10,
      }));
  });

  if (valueRows.length > 0) {
    await supabase.insert({
      schema,
      table: "product_option_values",
      rows: valueRows,
    });
  }
}

export async function resolveMenuIdForMenuItem(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  menuItemId: string,
): Promise<string | undefined> {
  const [menuItem] = await supabase.select<Pick<MenuItemRow, "menu_id">>({
    schema,
    table: "menu_items",
    query: {
      select: "menu_id",
      id: `eq.${menuItemId}`,
      limit: 1,
    },
  });

  return menuItem?.menu_id;
}

export async function resolveActiveMenuId(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  timezone?: string,
): Promise<string | undefined> {
  const [location] = await supabase.select<LocationRow>({
    schema,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,automation_enabled,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  if (!location) {
    return undefined;
  }

  const [menu] = await supabase.select<MenuRow>({
    schema,
    table: "menus",
    query: {
      select: "id,location_id,date,name,status,published_at",
      location_id: `eq.${location.id}`,
      date: `eq.${resolveBusinessDate(undefined, timezone)}`,
      status: "eq.published",
      limit: 1,
    },
  });

  return menu?.id;
}
