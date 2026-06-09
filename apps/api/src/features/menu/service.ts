import type { TodayMenuPayload } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
export { resolveMenuSelection, resolveMenuSelectionFromText, resolveMenuSelectionsFromText } from "./matcher";
export { buildMenuText, buildWelcomeMenuText, resolveBusinessDate } from "./presenter";
import { resolveBusinessDate } from "./presenter";
import {
  mapMenuItemRow,
  mapProductOptionRow,
  mapProductOptionValueRow,
  mapProductRow,
  selectActiveLocation,
  selectActiveProducts,
  selectAvailableMenuItems,
  selectLatestPublishedMenu,
  selectProductOptionsByProductIds,
  selectProductOptionValuesByOptionIds,
  selectPublishedMenuForDate,
} from "./repository";

export async function loadTodayPublishedMenu(input: {
  env: ApiBindings;
  schemaName: string;
  tenantSlug: string;
  timezone?: string;
  date?: string;
}): Promise<TodayMenuPayload> {
  const requestedDate = resolveBusinessDate(input.date, input.timezone);
  const location = await selectActiveLocation({
    env: input.env,
    schemaName: input.schemaName,
  });

  const menuForDate = location
    ? await selectPublishedMenuForDate({
        env: input.env,
        schemaName: input.schemaName,
        locationId: location.id,
        requestedDate,
      })
    : undefined;
  const fallbackMenu = location && !menuForDate
    ? await selectLatestPublishedMenu({
        env: input.env,
        schemaName: input.schemaName,
        locationId: location.id,
      })
    : undefined;
  const menu = menuForDate ?? fallbackMenu;

  const productRows = await selectActiveProducts({
    env: input.env,
    schemaName: input.schemaName,
  });
  const productOptions = await selectProductOptionsByProductIds({
    env: input.env,
    schemaName: input.schemaName,
    productIds: productRows.map((product) => product.id),
  });
  const optionValues = await selectProductOptionValuesByOptionIds({
    env: input.env,
    schemaName: input.schemaName,
    optionIds: productOptions.map((option) => option.id),
  });

  const itemRows = menu
    ? await selectAvailableMenuItems({
        env: input.env,
        schemaName: input.schemaName,
        menuId: menu.id,
      })
    : [];

  const valuesByOptionId = new Map<string, ReturnType<typeof mapProductOptionValueRow>[]>();
  for (const row of optionValues) {
    const existing = valuesByOptionId.get(row.option_id) ?? [];
    existing.push(mapProductOptionValueRow(row));
    valuesByOptionId.set(row.option_id, existing);
  }

  const optionsByProductId = new Map<string, ReturnType<typeof mapProductOptionRow>[]>();
  for (const row of productOptions) {
    const existing = optionsByProductId.get(row.product_id) ?? [];
    existing.push(mapProductOptionRow(row, valuesByOptionId.get(row.id) ?? []));
    optionsByProductId.set(row.product_id, existing);
  }

  const products = productRows.map((product) => mapProductRow(product, optionsByProductId.get(product.id)));
  const productById = new Map(products.map((product) => [product.id, product]));

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
    items: itemRows.map((item) => mapMenuItemRow(item, item.product_id ? productById.get(item.product_id) : undefined)),
    products,
  };
}
