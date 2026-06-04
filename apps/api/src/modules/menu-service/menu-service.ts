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
  emoji?: string | null;
  product_type?: "simple" | "composite" | null;
  image_url?: string | null;
  aliases?: unknown;
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
  aliases?: unknown;
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
      select: "id,name,description,base_price,category,emoji,product_type,image_url,aliases,is_active",
      is_active: "eq.true",
      order: "name.asc",
    },
  });

  const itemRows = menu
    ? await supabase.select<MenuItemRow>({
        schema: input.schemaName,
        table: "menu_items",
        query: {
          select: "id,menu_id,product_id,combo_id,display_name,price_override,available_quantity,aliases,is_available,sort_order",
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
      aliases: parseAliases(item.aliases),
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
      "Por ahora no veo un menú publicado para hoy.",
      "Si quieres, puedo ponerte en contacto con alguien del restaurante, o puedes intentarlo de nuevo en unos minutos.",
    ].join("\n");
  }

  const heading = payload.isFallbackMenu
    ? `🍽️ Mientras publican el menú de hoy, te comparto el último menú disponible de ${payload.location.name} (${payload.menu.date}):`
    : `🍽️ Este es nuestro menú de hoy en ${payload.location.name}:`;

  return [
    heading,
    "",
    buildGroupedMenuLines(payload.items),
    "",
    'Puedes pedirme por nombre, cantidad o número. Por ejemplo: "dos almuerzos y una limonada".',
  ].join("\n");
}

export function buildWelcomeMenuText(payload: TodayMenuPayload): string {
  return [
    "¡Hola! 👋",
    "",
    "Yo te ayudaré a tomar tu pedido automáticamente para que todo sea más rápido para ti y para el restaurante.",
    'Si prefieres hablar con alguien del restaurante en cualquier momento, escribe "asesor".',
    "",
    buildMenuText(payload),
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

export function resolveMenuSelectionsFromText(payload: TodayMenuPayload, text: string): Array<{ item: MenuItem; quantity: number }> {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return [];
  }

  const segments = normalizedText
    .split(/\b(?:y|tambien|ademas)\b|,/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length <= 1) {
    const single = resolveMenuSelectionFromText(payload, text);
    return single ? [single] : [];
  }

  const resolved: Array<{ item: MenuItem; quantity: number }> = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    const selection = resolveMenuSelectionFromText(payload, segment);
    if (!selection) {
      continue;
    }

    const key = selection.item.id;
    if (seen.has(key)) {
      const existing = resolved.find((entry) => entry.item.id === key);
      if (existing) {
        existing.quantity += selection.quantity;
      }
      continue;
    }

    seen.add(key);
    resolved.push(selection);
  }

  return resolved;
}

function mapProduct(row: ProductRow): Product {
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
    isActive: row.is_active,
  };
}

function buildGroupedMenuLines(items: TodayMenuPayload["items"]): string {
  const groups = new Map<string, Array<TodayMenuPayload["items"][number]>>();

  for (const item of items) {
    const categoryKey = normalizeCategoryKey(item.product?.category);
    const current = groups.get(categoryKey) ?? [];
    current.push(item);
    groups.set(categoryKey, current);
  }

  const orderedCategories = Array.from(groups.keys())
    .sort((left, right) => categoryPriority(left) - categoryPriority(right) || left.localeCompare(right, "es"));

  const lines: string[] = [];
  let index = 1;

  for (const category of orderedCategories) {
    const categoryItems = groups.get(category);
    if (!categoryItems || categoryItems.length === 0) {
      continue;
    }

    if (lines.length > 0) {
      lines.push("");
    }

    lines.push(formatCategoryHeading(category));

    for (const item of categoryItems) {
      const name = item.displayName ?? item.product?.name ?? `Producto ${index}`;
      const price = item.priceOverride ?? item.product?.basePrice ?? 0;
      lines.push(`${index}. ${name} — ${formatCop(price)}`);
      index += 1;
    }
  }

  return lines.join("\n");
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

function normalizeCategoryKey(value?: string | null): string {
  const normalized = value
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

  if (!normalized) {
    return "otros";
  }

  if (normalized.startsWith("desayun")) {
    return "desayunos";
  }

  if (normalized.startsWith("almuerz") || normalized.includes("menu del dia")) {
    return "almuerzos";
  }

  if (normalized.startsWith("bebid")) {
    return "bebidas";
  }

  if (normalized.startsWith("adicion")) {
    return "adiciones";
  }

  if (normalized.startsWith("combo")) {
    return "combos";
  }

  return "otros";
}

function categoryPriority(category: string): number {
  switch (category) {
    case "desayunos":
      return 1;
    case "almuerzos":
      return 2;
    case "bebidas":
      return 3;
    case "adiciones":
      return 4;
    case "combos":
      return 5;
    default:
      return 99;
  }
}

function formatCategoryHeading(category: string): string {
  switch (category) {
    case "desayunos":
      return "🍳 Desayunos";
    case "almuerzos":
      return "🍽️ Almuerzos";
    case "bebidas":
      return "🥤 Bebidas";
    case "adiciones":
      return "➕ Adiciones";
    case "combos":
      return "🎁 Combos";
    default:
      return "🍴 Otros";
  }
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
  const candidates = new Set<string>([
    normalizedName,
    ...(item.aliases ?? []).map(normalizeText),
    ...(item.product?.aliases ?? []).map(normalizeText),
  ]);

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

  const matches = Object.entries(spelledNumbers)
    .map(([token, value]) => {
      const match = new RegExp(`\\b${token}\\b`).exec(text);
      return match ? { index: match.index, value } : null;
    })
    .filter((entry): entry is { index: number; value: number } => Boolean(entry))
    .sort((left, right) => left.index - right.index);

  if (matches[0]) {
    return matches[0].value;
  }

  return 1;
}

function stripQuantityAndNoise(text: string): string {
  return text
    .replace(/\b\d+\b/g, " ")
    .replace(/\b(un|una|uno|dos|tres|cuatro|cinco|seis)\b/g, " ")
    .replace(/\b(porfa|por favor|quiero|me regalas|regalame|deme|dame|para|favor|pedido|porfis|domicilio|delivery|envio|recoger|retiro|pickup|tienda|pago|pagar|efectivo|cash|transferencia|transferir|nequi|daviplata)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map((token) => singularizeToken(token.trim()))
    .filter((token) => token.length > 1 && !["de", "del", "la", "el", "los", "las", "con"].includes(token));
}

function singularizeToken(token: string): string {
  if (token.length > 4 && token.endsWith("es")) {
    return token.slice(0, -2);
  }

  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }

  return token;
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

function parseAliases(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const aliases = value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  return aliases.length > 0 ? aliases : undefined;
}
