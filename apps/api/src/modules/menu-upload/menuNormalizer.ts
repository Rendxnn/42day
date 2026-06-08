import type { ProductOption } from "@42day/types";
import type { NormalizedMenuProduct, ParsedMenu, RawMenuOption } from "./types";

export function normalizeMenu(parsed: ParsedMenu): {
  categories: Array<{ items: NormalizedMenuProduct[]; name: string }>;
  products: NormalizedMenuProduct[];
} {
  const categories = parsed.categories.map((category) => ({
    name: category.name || "Sin categoria",
    items: category.items.map((item) => {
      const options = normalizeOptions(item.options ?? []);
      return {
        basePrice: Math.max(0, Math.round(item.price ?? 0)),
        category: item.category || category.name || "Sin categoria",
        confidence: item.confidence,
        currency: item.currency || "COP",
        description: item.description || undefined,
        isAvailable: item.available ?? true,
        name: item.name?.trim() ?? "Producto sin nombre",
        options,
        productType: options.length > 0 ? "composite" as const : "simple" as const,
      };
    }),
  }));

  return {
    categories,
    products: categories.flatMap((category) => category.items),
  };
}

function normalizeOptions(options: RawMenuOption[]): ProductOption[] {
  return options
    .filter((option) => option.name.trim() && option.values.length > 0)
    .map((option, optionIndex) => ({
      name: option.name.trim(),
      description: undefined,
      type: "single" as const,
      isRequired: false,
      minSelect: 0,
      maxSelect: 1,
      sortOrder: optionIndex * 10,
      displayMode: "buttons" as const,
      values: option.values
        .filter((value) => value.name.trim())
        .map((value, valueIndex) => ({
          name: value.name.trim(),
          description: undefined,
          priceDelta: Math.max(0, Math.round(value.price ?? 0)),
          isActive: true,
          sortOrder: valueIndex * 10,
        })),
    }));
}
