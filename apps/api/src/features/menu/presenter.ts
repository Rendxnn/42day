import type { TodayMenuPayload } from "@42day/types";

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
    ""
  ].join("\n");
}

export function buildWelcomeMenuText(payload: TodayMenuPayload, restaurantName?: string): string {
  const welcomeName = restaurantName?.trim() || payload.location?.name?.trim() || "nuestro restaurante";

  return [
    "¡Hola! 👋",
    "",
    `¡Bienvenido a ${welcomeName}!`,
    "Yo te ayudaré a tomar tu pedido automáticamente para que todo sea más rápido para ti y para el restaurante.",
    'Si prefieres hablar con alguien del restaurante en cualquier momento, escribe "asesor".',
    "",
    buildMenuText(payload),
  ].join("\n");
}

export function resolveBusinessDate(requestedDate?: string, timezone = "America/Bogota"): string {
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

function buildGroupedMenuLines(items: TodayMenuPayload["items"]): string {
  const groups = new Map<string, {
    label: string;
    items: Array<TodayMenuPayload["items"][number]>;
  }>();

  for (const item of items) {
    const label = normalizeCategoryLabel(item.product?.category);
    const categoryKey = normalizeCategoryKey(label);
    const current = groups.get(categoryKey) ?? { label, items: [] };
    current.items.push(item);
    groups.set(categoryKey, current);
  }

  const orderedCategories = Array.from(groups.keys())
    .sort((left, right) => categoryPriority(left) - categoryPriority(right) || left.localeCompare(right, "es"));

  const lines: string[] = [];
  let index = 1;

  for (const category of orderedCategories) {
    const group = groups.get(category);
    if (!group || group.items.length === 0) {
      continue;
    }

    if (lines.length > 0) {
      lines.push("");
    }

    lines.push(formatCategoryHeading(group.label));

    for (const item of group.items) {
      const name = item.displayName ?? item.product?.name ?? `Producto ${index}`;
      const price = item.priceOverride ?? item.product?.basePrice ?? 0;
      lines.push(`${index}. ${name} — ${formatCop(price)}`);
      lines.push(...buildCompositeOptionLines(item));
      index += 1;
    }
  }

  return lines.join("\n");
}

function buildCompositeOptionLines(item: TodayMenuPayload["items"][number]): string[] {
  const options = item.product?.productType === "composite" ? item.product.options ?? [] : [];
  const lines: string[] = [];

  for (const option of options) {
    if (option.type === "text") {
      lines.push(`   ↳ ${option.name}: indícanos este detalle.`);
      continue;
    }

    const minimum = Math.max(option.isRequired ? 1 : 0, option.minSelect);
    const maximum = Math.max(minimum, option.maxSelect);
    const rule = minimum === 0
      ? `opcional · máx. ${maximum}`
      : minimum === maximum
        ? `elige ${minimum} · máx. ${maximum}`
        : `elige ${minimum}–${maximum} · máx. ${maximum}`;
    const values = option.values
      .filter((value) => value.isActive)
      .slice(0, 10)
      .map((value) => value.name);
    const hiddenCount = option.values.filter((value) => value.isActive).length - values.length;
    const valuesText = [...values, ...(hiddenCount > 0 ? [`y ${hiddenCount} más`] : [])].join(", ");
    lines.push(`   ↳ ${option.name} (${rule}): ${valuesText || "por definir"}`);
  }

  return lines;
}

function formatCop(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeCategoryLabel(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Otros";
}

function normalizeCategoryKey(value?: string | null): string {
  return normalizeCategoryLabel(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    default:
      return 99;
  }
}

function formatCategoryHeading(categoryLabel: string): string {
  switch (normalizeCategoryKey(categoryLabel)) {
    case "desayunos":
      return "🍳 Desayunos";
    case "almuerzos":
      return "🍽️ Almuerzos";
    case "bebidas":
      return "🥤 Bebidas";
    case "adiciones":
      return "➕ Adiciones";
    default:
      return `🍴 ${categoryLabel}`;
  }
}
