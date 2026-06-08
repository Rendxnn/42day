import type { ParsedMenu, RawMenuCategory, RawMenuItem, RawMenuOption } from "./types";

type HeaderMap = {
  category?: number;
  description?: number;
  name?: number;
  optionPriceColumns: Array<{ index: number; label: string }>;
  price?: number;
};

export function parseStructuredRows(input: {
  fileType: ParsedMenu["fileType"];
  parser: string;
  rows: string[][];
}): ParsedMenu {
  const warnings: string[] = [];
  const rows = input.rows
    .map((row) => row.map((cell) => cleanCell(cell)).filter((_, index, source) => index < source.length))
    .filter((row) => row.some(Boolean));
  const headerIndex = rows.findIndex(isHeaderRow);
  const header = headerIndex >= 0 ? rows[headerIndex] : undefined;
  const headerMap = header ? mapHeader(header) : inferHeaderMap(rows);
  const categories = new Map<string, RawMenuCategory>();
  let currentCategory = "Sin categoria";

  for (const [rowIndex, row] of rows.entries()) {
    if (rowIndex === headerIndex) continue;
    if (looksLikeCategoryRow(row, headerMap)) {
      currentCategory = cleanCategory(row.find(Boolean) ?? currentCategory);
      ensureCategory(categories, currentCategory);
      continue;
    }

    const item = parseRowItem(row, headerMap, currentCategory);
    if (!item) continue;

    const category = item.category || currentCategory || "Sin categoria";
    ensureCategory(categories, category).items.push(item);
  }

  const parsedCategories = [...categories.values()].filter((category) => category.items.length > 0);
  const itemCount = parsedCategories.reduce((sum, category) => sum + category.items.length, 0);

  if (!header) warnings.push("No se encontro una fila de encabezados clara.");
  if (itemCount === 0) warnings.push("No se encontraron filas con producto y precio reconocible.");

  return {
    ambiguous: !header || itemCount === 0,
    categories: parsedCategories,
    extractedText: rows.map((row) => row.join(" | ")).join("\n"),
    fileType: input.fileType,
    parser: input.parser,
    source: "deterministic",
    warnings,
  };
}

export function parseMenuTextLines(input: {
  fileType: ParsedMenu["fileType"];
  parser: string;
  text: string;
}): ParsedMenu {
  const rows = input.text
    .split(/\r?\n/)
    .map((line) => splitTextLine(line))
    .filter((row) => row.some(Boolean));

  return {
    ...parseStructuredRows({
      fileType: input.fileType,
      parser: input.parser,
      rows,
    }),
    extractedText: input.text,
  };
}

function parseRowItem(row: string[], header: HeaderMap, fallbackCategory: string): RawMenuItem | null {
  const price = resolvePrice(row, header.price);
  const name = resolveName(row, header, price?.index);

  if (!name || !looksLikeProductName(name)) return null;

  const description = header.description !== undefined ? row[header.description] : resolveDescription(row, header, name, price?.index);
  const category = header.category !== undefined ? row[header.category] || fallbackCategory : fallbackCategory;
  const options = resolveOptionColumns(row, header, price?.value);

  return {
    available: true,
    category: cleanCategory(category),
    confidence: header.name !== undefined && price ? 0.86 : 0.68,
    currency: "COP",
    description: description && description !== name ? description : undefined,
    name,
    options,
    price: price?.value,
  };
}

function resolveName(row: string[], header: HeaderMap, priceIndex?: number): string {
  if (header.name !== undefined && row[header.name]) return row[header.name] ?? "";

  const candidate = row.find((cell, index) => index !== priceIndex && looksLikeProductName(cell) && parsePrice(cell) === undefined);
  return candidate ?? "";
}

function resolveDescription(row: string[], header: HeaderMap, name: string, priceIndex?: number): string | undefined {
  const ignored = new Set([
    header.name,
    header.price,
    header.category,
    priceIndex,
    ...header.optionPriceColumns.map((column) => column.index),
  ].filter((value): value is number => value !== undefined));
  const parts = row.filter((cell, index) => cell && !ignored.has(index) && cell !== name && parsePrice(cell) === undefined);
  return parts.join(" ").trim() || undefined;
}

function resolvePrice(row: string[], preferredIndex?: number): { index: number; value: number } | undefined {
  if (preferredIndex !== undefined) {
    const preferred = parsePrice(row[preferredIndex]);
    if (preferred !== undefined) return { index: preferredIndex, value: preferred };
  }

  for (const [index, cell] of row.entries()) {
    const price = parsePrice(cell);
    if (price !== undefined) return { index, value: price };
  }

  return undefined;
}

function resolveOptionColumns(row: string[], header: HeaderMap, basePrice?: number): RawMenuOption[] {
  const values = header.optionPriceColumns
    .map((column) => {
      const price = parsePrice(row[column.index]);
      if (price === undefined) return null;
      return {
        name: column.label,
        price: basePrice === undefined ? price : Math.max(0, price - basePrice),
      };
    })
    .filter((value): value is { name: string; price: number } => Boolean(value));

  return values.length > 0 ? [{ name: "Tamano", values }] : [];
}

function isHeaderRow(row: string[]): boolean {
  const joined = row.join(" ").toLowerCase();
  const hits = [
    /producto|plato|item|nombre/.test(joined),
    /precio|valor|costo|price/.test(joined),
    /categoria|categoría|seccion|sección/.test(joined),
    /descripcion|descripción|detalle|ingrediente/.test(joined),
  ].filter(Boolean).length;
  return hits >= 2;
}

function mapHeader(row: string[]): HeaderMap {
  const map: HeaderMap = { optionPriceColumns: [] };

  row.forEach((cell, index) => {
    const value = normalize(cell);
    if (map.name === undefined && /(producto|plato|item|nombre)/.test(value)) map.name = index;
    else if (map.description === undefined && /(descripcion|detalle|ingrediente)/.test(value)) map.description = index;
    else if (map.category === undefined && /(categoria|seccion|grupo)/.test(value)) map.category = index;
    else if (map.price === undefined && /(precio|valor|costo|price)/.test(value)) map.price = index;
    else if (/(pequeno|pequena|small|mediano|mediana|medium|grande|large|personal|familiar|topping|adicion)/.test(value)) {
      map.optionPriceColumns.push({ index, label: cell });
    }
  });

  return map;
}

function inferHeaderMap(rows: string[][]): HeaderMap {
  const maxColumns = Math.max(...rows.map((row) => row.length), 0);
  const priceCounts = Array.from({ length: maxColumns }, (_, index) => rows.filter((row) => parsePrice(row[index]) !== undefined).length);
  const price = priceCounts.indexOf(Math.max(...priceCounts));
  const priceCount = price >= 0 ? priceCounts[price] ?? 0 : 0;
  return {
    name: undefined,
    price: price >= 0 && priceCount > 0 ? price : undefined,
    optionPriceColumns: [],
  };
}

function looksLikeCategoryRow(row: string[], header: HeaderMap): boolean {
  const nonEmpty = row.filter(Boolean);
  if (nonEmpty.length !== 1) return false;
  const value = nonEmpty[0] ?? "";
  if (parsePrice(value) !== undefined) return false;
  if (header.name !== undefined && row[header.name]) return false;
  return value.length <= 42;
}

function ensureCategory(categories: Map<string, RawMenuCategory>, name: string): RawMenuCategory {
  const key = cleanCategory(name);
  const existing = categories.get(key);
  if (existing) return existing;

  const category = { name: key, items: [] };
  categories.set(key, category);
  return category;
}

function splitTextLine(line: string): string[] {
  const cleaned = cleanCell(line);
  if (!cleaned) return [];
  if (cleaned.includes("|")) return cleaned.split("|").map(cleanCell);
  if (cleaned.includes(";")) return cleaned.split(";").map(cleanCell);
  if (cleaned.includes(",")) return cleaned.split(",").map(cleanCell);

  const priceMatch = cleaned.match(/(.+?)\s+(\$?\s*\d[\d.,\s]*)$/);
  if (priceMatch) return [priceMatch[1], priceMatch[2]].map(cleanCell);
  return [cleaned];
}

function cleanCell(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanCategory(value: string): string {
  return cleanCell(value).replace(/[:\-]+$/g, "").trim() || "Sin categoria";
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function looksLikeProductName(value: string): boolean {
  const text = value.trim();
  return text.length >= 2 && !/^(total|subtotal|domicilio|telefono|whatsapp|instagram|direccion)$/i.test(text);
}

export function parsePrice(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.match(/\$?\s*((?:\d{1,3}(?:[.,\s]\d{3})+)|\d{4,7}|\d{1,3})(?:[.,]\d{2})?/);
  if (!match) return undefined;

  const normalized = (match[1] ?? "").replace(/[.,\s]/g, "");
  const price = Number(normalized);
  if (!Number.isFinite(price) || price <= 0) return undefined;
  return Math.round(price);
}
