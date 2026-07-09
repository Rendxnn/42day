import type { HumanInterventionAlert, Menu, MenuItem, Product } from "@42day/types";
import type { AlertRow, LocationRow, MenuItemRow, MenuRow, ProductRow } from "../types";

export function mapAlert(row: AlertRow): HumanInterventionAlert {
  return {
    id: row.id,
    conversationId: row.conversation_id ?? undefined,
    draftOrderId: row.draft_order_id ?? undefined,
    orderId: row.order_id ?? undefined,
    type: row.type as HumanInterventionAlert["type"],
    status: row.status,
    title: row.title,
    description: row.description ?? undefined,
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
  };
}

export function mapLocation(row: LocationRow) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    deliveryFeeFixed: row.delivery_fee_fixed,
    isActive: row.is_active,
  };
}

export function mapProduct(row: ProductRow, options?: Product["options"]): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    basePrice: row.base_price,
    category: row.category,
    emoji: row.emoji ?? undefined,
    imageUrl: row.image_url,
    productType: row.product_type ?? "simple",
    options: options ?? [],
    isActive: row.is_active,
  };
}

export function mapMenu(row: MenuRow): Menu {
  return {
    id: row.id,
    locationId: row.location_id,
    date: row.date,
    name: row.name,
    status: row.status,
    publishedAt: row.published_at,
  };
}

export function mapMenuItem(row: MenuItemRow, product?: Product): MenuItem {
  return {
    id: row.id,
    menuId: row.menu_id,
    productId: row.product_id,
    comboId: row.combo_id,
    displayName: row.display_name,
    priceOverride: row.price_override,
    availableQuantity: row.available_quantity,
    isAvailable: row.is_available,
    sortOrder: row.sort_order,
    product,
  };
}
