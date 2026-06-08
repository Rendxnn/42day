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
