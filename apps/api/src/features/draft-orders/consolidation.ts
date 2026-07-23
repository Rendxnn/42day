import type { OrderLineItem } from "@42day/types";

/**
 * Keeps the draft canonical before it crosses the database boundary.
 * Identical products are one line with an accumulated quantity, while a
 * different configuration or note intentionally remains a separate line.
 */
export function consolidateOrderLineItems(items: OrderLineItem[]): OrderLineItem[] {
  const consolidated: OrderLineItem[] = [];
  const indexesByIdentity = new Map<string, number>();

  for (const source of items) {
    const item = structuredClone(source);
    item.quantity = Math.max(1, Math.round(item.quantity));
    item.lineTotal = item.quantity * item.unitPrice;

    const identity = buildLineIdentity(item);
    const existingIndex = indexesByIdentity.get(identity);
    if (existingIndex === undefined) {
      indexesByIdentity.set(identity, consolidated.length);
      consolidated.push(item);
      continue;
    }

    const existing = consolidated[existingIndex]!;
    existing.quantity += item.quantity;
    existing.lineTotal = existing.quantity * existing.unitPrice;
  }

  return consolidated;
}

function buildLineIdentity(item: OrderLineItem): string {
  return stableSerialize({
    menuItemId: item.menuItemId ?? null,
    productId: item.productId ?? null,
    comboId: item.comboId ?? null,
    categorySnapshot: item.categorySnapshot ?? null,
    productImageUrl: item.productImageUrl ?? null,
    productEmoji: item.productEmoji ?? null,
    name: item.name.trim(),
    unitPrice: item.unitPrice,
    notes: item.notes?.trim() || null,
    options: item.options
      ? {
          mode: item.options.mode,
          resolvedOptions: item.options.resolvedOptions ?? null,
          freeTextNotes: item.options.freeTextNotes ?? null,
          pricing: item.options.pricing ?? null,
        }
      : null,
  });
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
