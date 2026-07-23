import type { MenuItem, OrderLineItem } from "@42day/types";

export type ReplacementPools = {
  same: MenuItem[];
  other: MenuItem[];
};

export function buildReplacementPools(
  menuItems: MenuItem[],
  selectedOrderItem: OrderLineItem | null,
): ReplacementPools {
  if (!selectedOrderItem) {
    return { same: [], other: [] };
  }

  const normalizedCategory = normalizeCategoryKey(
    resolveOrderItemCategory(selectedOrderItem, menuItems),
  );
  const activeCandidates = menuItems
    .filter((item) => item.isAvailable === true)
    .filter((item) => item.product?.isActive !== false)
    .filter((item) => item.id !== selectedOrderItem.menuItemId)
    .filter((item) => item.productId !== selectedOrderItem.productId)
    .filter((item) => item.product?.id !== selectedOrderItem.productId)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return {
    same: activeCandidates
      .filter((item) => normalizeCategoryKey(resolveMenuItemCategory(item, menuItems)) === normalizedCategory)
      .slice(0, 8),
    other: activeCandidates
      .filter((item) => normalizeCategoryKey(resolveMenuItemCategory(item, menuItems)) !== normalizedCategory)
      .slice(0, 16),
  };
}

export function resolveCategoryFromMenuItem(menuItems: MenuItem[], menuItemId?: string) {
  if (!menuItemId) return undefined;
  return menuItems.find((item) => item.id === menuItemId)?.product?.category;
}

function resolveCategoryFromProductId(menuItems: MenuItem[], productId?: string) {
  if (!productId) return undefined;
  return menuItems.find((item) => item.productId === productId || item.product?.id === productId)?.product?.category;
}

function resolveMenuItemCategory(item: MenuItem, menuItems: MenuItem[]) {
  return item.product?.category
    || resolveCategoryFromProductId(menuItems, item.productId ?? item.product?.id)
    || resolveCategoryFromMenuItem(menuItems, item.id);
}

export function resolveOrderItemCategory(item: OrderLineItem, menuItems: MenuItem[]) {
  return item.categorySnapshot
    || resolveCategoryFromProductId(menuItems, item.productId)
    || resolveCategoryFromMenuItem(menuItems, item.menuItemId);
}

function normalizeCategoryKey(value?: string | null) {
  const normalized = (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  if (normalized.length <= 4) return normalized;
  if (normalized.endsWith("ces")) return `${normalized.slice(0, -3)}z`;
  if (normalized.endsWith("s")) return normalized.slice(0, -1);
  return normalized;
}
