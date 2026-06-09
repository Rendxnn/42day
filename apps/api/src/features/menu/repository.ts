import type { MenuItem, Product, ProductOption, ProductOptionValue } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { createSupabaseRestClient } from "../../lib/supabase-rest";

export type LocationRow = {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  delivery_fee_fixed: number;
  pickup_enabled?: boolean;
  delivery_enabled?: boolean;
  automation_enabled?: boolean;
  is_active: boolean;
};

export type MenuRow = {
  id: string;
  location_id: string;
  date: string;
  name: string;
  status: "draft" | "published" | "archived";
  published_at?: string | null;
};

export type ProductRow = {
  id: string;
  name: string;
  description?: string | null;
  base_price: number;
  category?: string | null;
  emoji?: string | null;
  product_type?: "simple" | "composite" | null;
  image_url?: string | null;
  aliases?: unknown;
  is_active: boolean;
};

export type ProductOptionRow = {
  id: string;
  product_id: string;
  code?: string | null;
  name: string;
  description?: string | null;
  aliases?: unknown;
  type: "single" | "multiple" | "text";
  is_required: boolean;
  min_select: number;
  max_select: number;
  sort_order: number;
  display_mode?: "list" | "buttons" | "swatches" | "text" | null;
};

export type ProductOptionValueRow = {
  id: string;
  option_id: string;
  code?: string | null;
  name: string;
  description?: string | null;
  aliases?: unknown;
  price_delta: number;
  is_active: boolean;
  sort_order: number;
};

export type MenuItemRow = {
  id: string;
  menu_id: string;
  product_id?: string | null;
  combo_id?: string | null;
  display_name?: string | null;
  price_override?: number | null;
  available_quantity?: number | null;
  aliases?: unknown;
  is_available: boolean;
  sort_order: number;
};

export async function selectActiveLocation(input: {
  env: ApiBindings;
  schemaName: string;
}): Promise<LocationRow | undefined> {
  const [location] = await createSupabaseRestClient(input.env).select<LocationRow>({
    schema: input.schemaName,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,pickup_enabled,delivery_enabled,automation_enabled,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  return location;
}

export async function selectPublishedMenuForDate(input: {
  env: ApiBindings;
  schemaName: string;
  locationId: string;
  requestedDate: string;
}): Promise<MenuRow | undefined> {
  const [menu] = await createSupabaseRestClient(input.env).select<MenuRow>({
    schema: input.schemaName,
    table: "menus",
    query: {
      select: "id,location_id,date,name,status,published_at",
      location_id: `eq.${input.locationId}`,
      date: `eq.${input.requestedDate}`,
      status: "eq.published",
      limit: 1,
    },
  });

  return menu;
}

export async function selectLatestPublishedMenu(input: {
  env: ApiBindings;
  schemaName: string;
  locationId: string;
}): Promise<MenuRow | undefined> {
  const [menu] = await createSupabaseRestClient(input.env).select<MenuRow>({
    schema: input.schemaName,
    table: "menus",
    query: {
      select: "id,location_id,date,name,status,published_at",
      location_id: `eq.${input.locationId}`,
      status: "eq.published",
      order: "date.desc",
      limit: 1,
    },
  });

  return menu;
}

export async function selectActiveProducts(input: {
  env: ApiBindings;
  schemaName: string;
}): Promise<ProductRow[]> {
  return createSupabaseRestClient(input.env).select<ProductRow>({
    schema: input.schemaName,
    table: "products",
    query: {
      select: "id,name,description,base_price,category,emoji,product_type,image_url,aliases,is_active",
      is_active: "eq.true",
      order: "name.asc",
    },
  });
}

export async function selectProductOptionsByProductIds(input: {
  env: ApiBindings;
  schemaName: string;
  productIds: string[];
}): Promise<ProductOptionRow[]> {
  if (input.productIds.length === 0) {
    return [];
  }

  return createSupabaseRestClient(input.env).select<ProductOptionRow>({
    schema: input.schemaName,
    table: "product_options",
    query: {
      select: "id,product_id,code,name,description,aliases,type,is_required,min_select,max_select,sort_order,display_mode",
      product_id: `in.(${input.productIds.join(",")})`,
      order: "sort_order.asc",
    },
  });
}

export async function selectProductOptionValuesByOptionIds(input: {
  env: ApiBindings;
  schemaName: string;
  optionIds: string[];
}): Promise<ProductOptionValueRow[]> {
  if (input.optionIds.length === 0) {
    return [];
  }

  return createSupabaseRestClient(input.env).select<ProductOptionValueRow>({
    schema: input.schemaName,
    table: "product_option_values",
    query: {
      select: "id,option_id,code,name,description,aliases,price_delta,is_active,sort_order",
      option_id: `in.(${input.optionIds.join(",")})`,
      order: "sort_order.asc",
    },
  });
}

export async function selectAvailableMenuItems(input: {
  env: ApiBindings;
  schemaName: string;
  menuId: string;
}): Promise<MenuItemRow[]> {
  return createSupabaseRestClient(input.env).select<MenuItemRow>({
    schema: input.schemaName,
    table: "menu_items",
    query: {
      select: "id,menu_id,product_id,combo_id,display_name,price_override,available_quantity,aliases,is_available,sort_order",
      menu_id: `eq.${input.menuId}`,
      is_available: "eq.true",
      order: "sort_order.asc",
    },
  });
}

export function mapProductOptionValueRow(row: ProductOptionValueRow): ProductOptionValue {
  return {
    id: row.id,
    code: row.code ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    aliases: parseAliases(row.aliases),
    priceDelta: row.price_delta,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

export function mapProductOptionRow(row: ProductOptionRow, values: ProductOptionValue[]): ProductOption {
  return {
    id: row.id,
    code: row.code ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    aliases: parseAliases(row.aliases),
    type: row.type,
    isRequired: row.is_required,
    minSelect: row.min_select,
    maxSelect: row.max_select,
    sortOrder: row.sort_order,
    displayMode: row.display_mode ?? undefined,
    values,
  };
}

export function mapProductRow(row: ProductRow, options?: ProductOption[]): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    basePrice: row.base_price,
    category: row.category ?? undefined,
    emoji: row.emoji ?? undefined,
    productType: row.product_type ?? "simple",
    imageUrl: row.image_url ?? undefined,
    aliases: parseAliases(row.aliases),
    options: options && options.length > 0 ? options : undefined,
    isActive: row.is_active,
  };
}

export function mapMenuItemRow(row: MenuItemRow, product?: Product): MenuItem {
  return {
    id: row.id,
    menuId: row.menu_id,
    productId: row.product_id ?? undefined,
    comboId: row.combo_id ?? undefined,
    displayName: row.display_name ?? undefined,
    priceOverride: row.price_override ?? undefined,
    availableQuantity: row.available_quantity ?? undefined,
    aliases: parseAliases(row.aliases),
    isAvailable: row.is_available,
    sortOrder: row.sort_order,
    product,
  };
}

function parseAliases(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const aliases = value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  return aliases.length > 0 ? aliases : undefined;
}
