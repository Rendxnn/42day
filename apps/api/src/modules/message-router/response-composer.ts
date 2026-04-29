import type { DraftOrder, PaymentMethod, TodayMenuPayload } from "@42day/types";

const DEFAULT_ESTIMATED_MINUTES = 30;

export function buildFulfillmentPrompt(_menu: TodayMenuPayload): string {
  return "Lo seguimos a domicilio o para recoger?";
}

export function buildDeliveryAddressPrompt(): string {
  return "Listo, va a domicilio. Enviame la ubicacion de WhatsApp o escribeme la direccion.";
}

export function buildPaymentPrompt(_draft: DraftOrder, menu: TodayMenuPayload): string {
  const lines = ["Como prefieres pagar: efectivo o transferencia?"];

  if (menu.location?.deliveryFeeFixed && menu.location.deliveryFeeFixed > 0) {
    lines.push(`El domicilio queda en ${formatCop(menu.location.deliveryFeeFixed)}.`);
  }

  return lines.join("\n");
}

export function buildAddMorePrompt(draft: DraftOrder): string {
  return [
    `Listo, llevo ${formatDraftItemsInline(draft)}.`,
    `Subtotal: ${formatCop(draft.subtotal)}.`,
    "",
    "Quieres agregar algo mas o seguimos con la entrega?",
  ].join("\n");
}

export function buildOrderAdjustedPrompt(draft: DraftOrder): string {
  if (draft.items.length === 0) {
    return "Listo, quite esos productos. Que quieres pedir?";
  }

  return [
    `Listo, lo ajuste. Ahora llevo ${formatDraftItemsInline(draft)}.`,
    `Subtotal: ${formatCop(draft.subtotal)}.`,
    "",
    draft.fulfillmentType && draft.paymentMethod
      ? "Asi queda bien o quieres cambiar algo mas?"
      : "Quieres agregar algo mas o seguimos con la entrega?",
  ].join("\n");
}

export function buildCurrentDraftText(draft: DraftOrder): string {
  if (draft.items.length === 0) {
    return "Todavia no tengo productos en el pedido.";
  }

  return `Hasta ahora llevo ${formatDraftItemsInline(draft)}.`;
}

export function buildOrderSummaryText(draft: DraftOrder, paymentMethod: PaymentMethod): string {
  const lines = ["Te confirmo el pedido:", ""];

  for (const item of draft.items) {
    lines.push(`${item.quantity} x ${item.name} - ${formatCop(item.lineTotal)}`);
  }

  lines.push("", `Subtotal: ${formatCop(draft.subtotal)}`);

  if (draft.fulfillmentType === "delivery") {
    lines.push(`Domicilio: ${formatCop(draft.deliveryFee)}`);
  } else {
    lines.push("Entrega: para recoger");
  }

  lines.push(`Pago: ${paymentMethod === "cash" ? "efectivo" : "transferencia"}`);
  lines.push(`Tiempo estimado: ${DEFAULT_ESTIMATED_MINUTES} min`);
  lines.push(`Total: ${formatCop(draft.total)}`);
  lines.push("", "Si esta todo bien, respondeme si y registro el pedido. Si quieres cambiar algo, dimelo de una.");

  return lines.join("\n");
}

export function buildClarificationPrompt(state: DraftOrderStateLike): string {
  switch (state) {
    case "awaiting_guided_item_selection":
      return "Dime que quieres pedir del menu de hoy. Puede ser por nombre o por numero.";
    case "awaiting_more_items":
      return "Quieres agregar algo mas o seguimos con la entrega?";
    case "awaiting_fulfillment_type":
      return "Lo dejamos a domicilio o para recoger?";
    case "awaiting_address":
      return "Enviame la ubicacion de WhatsApp o escribeme la direccion para continuar.";
    case "awaiting_payment_method":
      return "Pagas en efectivo o por transferencia?";
    case "awaiting_confirmation":
      return "Si esta bien, respondeme si. Si quieres cambiar algo, dime que ajustamos.";
    case "awaiting_transfer_proof":
      return "Quedo pendiente el comprobante de transferencia para que el restaurante lo revise.";
    default:
      return "Escribeme menu para ver las opciones o asesor si quieres hablar con alguien del restaurante.";
  }
}

export function buildManualHandoffMessage(): string {
  return "Listo, te paso con alguien del restaurante para que te ayude.";
}

export function buildMaxClarificationMessage(): string {
  return "No quiero enredarte por aqui. Te paso con alguien del restaurante para seguir bien.";
}

export function formatCop(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

type DraftOrderStateLike =
  | "awaiting_guided_item_selection"
  | "awaiting_more_items"
  | "awaiting_fulfillment_type"
  | "awaiting_address"
  | "awaiting_payment_method"
  | "awaiting_transfer_proof"
  | "awaiting_confirmation"
  | string;

function formatDraftItemsInline(draft: DraftOrder): string {
  if (draft.items.length === 0) {
    return "el pedido vacio";
  }

  return draft.items
    .map((item) => `${item.quantity} ${item.name}`)
    .join(", ");
}
