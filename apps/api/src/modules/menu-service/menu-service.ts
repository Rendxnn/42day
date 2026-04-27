import type { MenuItem, Product, TodayMenuPayload } from "@42day/types";
import { createSupabaseRestClient } from "../../lib/supabase-rest";
import type { ApiBindings } from "../../lib/bindings";

type LocationRow = {
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

type MenuRow = {
  id: string;
  location_id: string;
  date: string;
  name: string;
  status: "draft" | "published" | "archived";
  published_at?: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  description?: string | null;
  base_price: number;
  category?: string | null;
  image_url?: string | null;
  is_active: boolean;
};

type MenuItemRow = {
  id: string;
  menu_id: string;
  product_id?: string | null;
  combo_id?: string | null;
  display_name?: string | null;
  price_override?: number | null;
  available_quantity?: number | null;
  is_available: boolean;
  sort_order: number;
};

export async function loadTodayPublishedMenu(input: {
  env: ApiBindings;
  schemaName: string;
  tenantSlug: string;
  timezone?: string;
  date?: string;
}): Promise<TodayMenuPayload> {
  const supabase = createSupabaseRestClient(input.env);
  const requestedDate = resolveBusinessDate(input.date, input.timezone);
  const [location] = await supabase.select<LocationRow>({
    schema: input.schemaName,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,pickup_enabled,delivery_enabled,automation_enabled,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  const [menuForDate] = location
    ? await supabase.select<MenuRow>({
        schema: input.schemaName,
        table: "menus",
        query: {
          select: "id,location_id,date,name,status,published_at",
          location_id: `eq.${location.id}`,
          date: `eq.${requestedDate}`,
          status: "eq.published",
          limit: 1,
        },
      })
    : [];
  const [fallbackMenu] =
    location && !menuForDate
      ? await supabase.select<MenuRow>({
          schema: input.schemaName,
          table: "menus",
          query: {
            select: "id,location_id,date,name,status,published_at",
            location_id: `eq.${location.id}`,
            status: "eq.published",
            order: "date.desc",
            limit: 1,
          },
        })
      : [];
  const menu = menuForDate ?? fallbackMenu;

  const products = await supabase.select<ProductRow>({
    schema: input.schemaName,
    table: "products",
    query: {
      select: "id,name,description,base_price,category,image_url,is_active",
      is_active: "eq.true",
      order: "name.asc",
    },
  });

  const itemRows = menu
    ? await supabase.select<MenuItemRow>({
        schema: input.schemaName,
        table: "menu_items",
        query: {
          select: "id,menu_id,product_id,combo_id,display_name,price_override,available_quantity,is_available,sort_order",
          menu_id: `eq.${menu.id}`,
          is_available: "eq.true",
          order: "sort_order.asc",
        },
      })
    : [];

  const productById = new Map(products.map((product) => [product.id, mapProduct(product)]));

  return {
    tenantSlug: input.tenantSlug,
    tenantSchema: input.schemaName,
    requestedDate,
    isFallbackMenu: Boolean(menu && menu.date !== requestedDate),
    location: location
      ? {
          id: location.id,
          name: location.name,
          address: location.address,
          phone: location.phone,
          deliveryFeeFixed: location.delivery_fee_fixed,
          pickupEnabled: location.pickup_enabled,
          deliveryEnabled: location.delivery_enabled,
          automationEnabled: location.automation_enabled,
          isActive: location.is_active,
        }
      : undefined,
    menu: menu
      ? {
          id: menu.id,
          locationId: menu.location_id,
          date: menu.date,
          name: menu.name,
          status: menu.status,
          publishedAt: menu.published_at ?? undefined,
        }
      : undefined,
    items: itemRows.map((item) => ({
      id: item.id,
      menuId: item.menu_id,
      productId: item.product_id ?? undefined,
      comboId: item.combo_id ?? undefined,
      displayName: item.display_name ?? undefined,
      priceOverride: item.price_override ?? undefined,
      availableQuantity: item.available_quantity ?? undefined,
      isAvailable: item.is_available,
      sortOrder: item.sort_order,
      product: item.product_id ? productById.get(item.product_id) : undefined,
    })),
    products: products.map(mapProduct),
  };
}

export function buildMenuText(payload: TodayMenuPayload): string {
  if (!payload.location || !payload.menu || payload.items.length === 0) {
    return [
      "Todavia no veo un menu publicado para hoy.",
      "Si quieres, te paso con alguien del restaurante o lo intentamos de nuevo en un momento.",
    ].join("\n");
  }

  const lines = payload.items.map((item, index) => {
    const name = item.displayName ?? item.product?.name ?? `Producto ${index + 1}`;
    const price = item.priceOverride ?? item.product?.basePrice ?? 0;
    return `${index + 1}. ${name} - ${formatCop(price)}`;
  });

  const heading = payload.isFallbackMenu
    ? `Te muestro el ultimo menu publicado (${payload.menu.date}) de ${payload.location.name}:`
    : `Este es el menu de hoy de ${payload.location.name}:`;

  return [
    heading,
    ...lines,
    "",
    "Escribe el numero del producto para agregarlo al pedido.",
  ].join("\n");
}

export function buildWelcomeMenuText(payload: TodayMenuPayload): string {
  return [
    `Hola, soy el asistente de pedidos de ${payload.location?.name ?? "la tienda"}. ¿Como vas?`,
    "",
    buildMenuText(payload),
    "",
    "Si quieres, tambien puedes escribir:",
    "- asesor",
    "- menu",
    "- pedido guiado",
  ].join("\n");
}

export function resolveMenuSelection(payload: TodayMenuPayload, selection: number): MenuItem | null {
  if (!Number.isInteger(selection) || selection < 1) {
    return null;
  }

  return payload.items[selection - 1] ?? null;
}

export function resolveMenuSelectionFromText(payload: TodayMenuPayload, text: string): { item: MenuItem; quantity: number } | null {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return null;
  }

  const quantity = extractQuantity(normalizedText);
  const searchText = stripQuantityAndNoise(normalizedText);
  if (!searchText) {
    return null;
  }

  const matches = payload.items
    .map((item) => ({
      item,
      score: computeMenuMatchScore(item, searchText),
    }))
    .filter((candidate) => candidate.score >= 0.75)
    .sort((left, right) => right.score - left.score);

  const best = matches[0];
  const second = matches[1];

  if (!best) {
    return null;
  }

  if (second && best.score - second.score < 0.1) {
    return null;
  }

  return {
    item: best.item,
    quantity,
  };
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    basePrice: row.base_price,
    category: row.category ?? undefined,
    imageUrl: row.image_url ?? undefined,
    isActive: row.is_active,
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

function formatCop(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function computeMenuMatchScore(item: MenuItem, searchText: string): number {
  const candidateTexts = buildCandidateTexts(item).map(normalizeText);

  if (candidateTexts.includes(searchText)) {
    return 1;
  }

  for (const candidateText of candidateTexts) {
    if (candidateText.includes(searchText) || searchText.includes(candidateText)) {
      return 0.93;
    }
  }

  let bestScore = 0;
  for (const candidateText of candidateTexts) {
    const candidateTokens = tokenize(candidateText);
    const searchTokens = tokenize(searchText);
    if (candidateTokens.length === 0 || searchTokens.length === 0) {
      continue;
    }

    const overlap = searchTokens.filter((token) => candidateTokens.includes(token)).length;
    const coverage = overlap / searchTokens.length;
    const candidateCoverage = overlap / candidateTokens.length;
    bestScore = Math.max(bestScore, coverage * 0.7 + candidateCoverage * 0.3);
  }

  return bestScore;
}

function buildCandidateTexts(item: MenuItem): string[] {
  const name = item.displayName ?? item.product?.name ?? "";
  const normalizedName = normalizeText(name);
  const candidates = new Set<string>([normalizedName]);

  if (normalizedName.includes("almuerzo del dia")) {
    candidates.add("menu del dia");
    candidates.add("almuerzo del dia");
    candidates.add("almuerzo");
  }

  if (normalizedName.includes("sopa del dia")) {
    candidates.add("sopa del dia");
    candidates.add("sopa");
  }

  return Array.from(candidates).filter(Boolean);
}

function extractQuantity(text: string): number {
  const directNumberMatch = text.match(/\b(\d+)\b/);
  if (directNumberMatch) {
    return Math.max(1, Number(directNumberMatch[1]));
  }

  const spelledNumbers: Record<string, number> = {
    un: 1,
    una: 1,
    uno: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
  };

  for (const [token, value] of Object.entries(spelledNumbers)) {
    if (new RegExp(`\\b${token}\\b`).test(text)) {
      return value;
    }
  }

  return 1;
}

function stripQuantityAndNoise(text: string): string {
  return text
    .replace(/\b\d+\b/g, " ")
    .replace(/\b(un|una|uno|dos|tres|cuatro|cinco|seis)\b/g, " ")
    .replace(/\b(porfa|por favor|quiero|me regalas|regalame|deme|dame|para|favor|pedido|porfis)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !["de", "del", "la", "el", "los", "las", "con"].includes(token));
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
