import type { DraftOrderItemRow } from "./repository";
import type { MenuItem } from "@42day/types";

export function findMatchingDraftOrderItemRows(rows: DraftOrderItemRow[], input: {
  menuItem?: Pick<MenuItem, "id" | "productId" | "displayName" | "product">;
  targetText?: string;
}): DraftOrderItemRow[] {
  const byMenuItem = input.menuItem?.id ? rows.filter((row) => row.menu_item_id === input.menuItem?.id) : [];
  if (byMenuItem.length > 0) {
    return byMenuItem;
  }

  const byProduct = input.menuItem?.productId ? rows.filter((row) => row.product_id === input.menuItem?.productId) : [];
  if (byProduct.length > 0) {
    return byProduct;
  }

  const target = normalizeMatchText(input.targetText ?? input.menuItem?.displayName ?? input.menuItem?.product?.name);
  if (!target) {
    return [];
  }

  return rows.filter((row) => {
    const candidate = normalizeMatchText(row.name_snapshot);
    return candidate === target || candidate.includes(target) || target.includes(candidate);
  });
}

function normalizeMatchText(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\b(la|el|los|las|un|una|uno|unos|unas|del|de)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .map(singularizeMatchToken)
    .join(" ");
}

function singularizeMatchToken(token: string): string {
  if (token.length > 4 && token.endsWith("es")) {
    return token.slice(0, -2);
  }

  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }

  return token;
}
