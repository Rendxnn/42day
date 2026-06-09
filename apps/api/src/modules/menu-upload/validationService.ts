import type { ParsedMenu, RawMenuCategory, RawMenuItem } from "./types";

export function validateParsedMenu(parsed: ParsedMenu): ParsedMenu {
  const warnings = [...parsed.warnings];
  const categories = parsed.categories
    .map((category) => ({
      name: normalizeCategory(category.name),
      items: category.items
        .map((item) => normalizeItem(item, category.name))
        .filter((item): item is RawMenuItem => Boolean(item)),
    }))
    .filter((category) => category.items.length > 0);

  const itemCount = categories.reduce((sum, category) => sum + category.items.length, 0);
  const pricedCount = categories.reduce(
    (sum, category) => sum + category.items.filter((item) => item.price !== undefined && item.price >= 0).length,
    0,
  );

  if (itemCount === 0) {
    warnings.push("No se detectaron productos legibles.");
  }

  if (itemCount > 0 && pricedCount / itemCount < 0.65) {
    warnings.push("La mayoria de productos no tiene precio claro.");
  }

  return {
    ...parsed,
    ambiguous: parsed.ambiguous || itemCount === 0 || pricedCount / Math.max(itemCount, 1) < 0.65,
    categories,
    warnings,
  };
}

function normalizeItem(item: RawMenuItem, fallbackCategory: string): RawMenuItem | null {
  const name = cleanText(item.name ?? "");
  if (!name || isDecorativeText(name)) return null;

  const price = item.price === undefined ? undefined : Number(item.price);

  return {
    ...item,
    available: item.available ?? true,
    category: normalizeCategory(item.category || fallbackCategory),
    confidence: item.confidence,
    currency: item.currency || "COP",
    description: cleanText(item.description ?? ""),
    name,
    price: typeof price === "number" && Number.isFinite(price) ? Math.max(0, Math.round(price)) : undefined,
  };
}

function normalizeCategory(category: string): string {
  const value = cleanText(category);
  return value || "Sin categoria";
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isDecorativeText(value: string): boolean {
  return /^(menu|menú|precio|producto|descripcion|descripción|categoria|categoría)$/i.test(value.trim());
}

export function countParsedItems(categories: RawMenuCategory[]): number {
  return categories.reduce((sum, category) => sum + category.items.length, 0);
}
