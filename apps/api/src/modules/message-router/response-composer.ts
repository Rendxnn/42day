import type { DraftOrder, OrderLineItem, OrderStatus, PaymentMethod, ProductOption, TodayMenuPayload } from "@42day/types";

const DEFAULT_ESTIMATED_MINUTES = 30;

export function buildFulfillmentPrompt(menu: TodayMenuPayload): string {
  if (menu.location?.deliveryEnabled === false) {
    return "En este momento solo tenemos disponible la opcion de recoger en el local. Escribe recoger para continuar.";
  }
  return "Con gusto 😊 ¿Prefieres que lo enviemos a domicilio o lo tendrás para recoger?";
}

export function buildDeliveryAddressPrompt(): string {
  return "Perfecto 📍 Por favor, envíame tu ubicación de WhatsApp o escríbeme la dirección completa para continuar. Después te pediré los datos de facturación.";
}

export function buildPaymentPrompt(draft: DraftOrder, _menu: TodayMenuPayload): string {
  const lines = ["Muy bien. ¿Cómo prefieres pagar: en efectivo o por transferencia?"];

  if (draft.fulfillmentType === "delivery" && draft.deliveryFee > 0) {
    lines.push(`El valor del domicilio es de ${formatCop(draft.deliveryFee)}.`);
  }

  return lines.join("\n");
}

export function buildAddMorePrompt(draft: DraftOrder): string {
  return [
    "Perfecto ✨ Ya actualicé tu pedido.",
    buildOrderProgressSnapshot(draft),
    "",
    "¿Te gustaría agregar algo más o prefieres que sigamos con la entrega?",
  ].join("\n");
}

export function buildOrderAdjustedPrompt(draft: DraftOrder): string {
  if (draft.items.length === 0) {
    return "Listo, ya retiré esos productos. Cuéntame, por favor, qué te gustaría pedir ahora.";
  }

  return [
    "Perfecto ✨ Ya actualicé tu pedido.",
    buildOrderProgressSnapshot(draft),
    "",
    draft.fulfillmentType && draft.paymentMethod
      ? "¿Así está bien o quieres que ajuste algo más?"
      : "¿Te gustaría agregar algo más o prefieres que sigamos con la entrega?",
  ].join("\n");
}

export function buildCurrentDraftText(draft: DraftOrder): string {
  if (draft.items.length === 0) {
    return "Aún no tengo productos registrados en tu pedido.";
  }

  return buildOrderProgressSnapshot(draft);
}

export function buildOrderSummaryText(draft: DraftOrder, paymentMethod: PaymentMethod): string {
  const lines = ["🧾 Así quedaría tu pedido:", ""];

  for (const item of draft.items) {
    lines.push(`• ${item.quantity} x ${formatLineItemLabel(item)} — ${formatCop(item.lineTotal)}`);
  }

  lines.push("", `Subtotal: ${formatCop(draft.subtotal)}`);

  if (draft.fulfillmentType === "delivery") {
    lines.push(`Domicilio: ${formatCop(draft.deliveryFee)}`);
    if (draft.deliveryAddress) {
      lines.push(`Dirección de entrega: ${draft.deliveryAddress}`);
    }
    if (draft.deliveryAddressDetails) {
      lines.push(`Indicaciones de entrega: ${draft.deliveryAddressDetails}`);
    }
  } else {
    lines.push("Entrega: para recoger");
  }

  if (draft.billing?.type === "electronic") {
    lines.push(`Factura: electrónica a nombre de ${draft.billing.legalName ?? "cliente"}`);
    if (draft.billing.taxId) lines.push(`NIT o cédula: ${draft.billing.taxId}`);
    if (draft.billing.email) lines.push(`Correo de facturación: ${draft.billing.email}`);
  } else if (draft.billing?.fullName) {
    lines.push(`Factura: normal a nombre de ${draft.billing.fullName}`);
    if (draft.billing.billingAddress) lines.push(`Dirección de facturación: ${draft.billing.billingAddress}`);
  }

  lines.push(`Pago: ${paymentMethod === "cash" ? "efectivo" : "transferencia"}`);
  lines.push(`Tiempo estimado: ${DEFAULT_ESTIMATED_MINUTES} min`);
  lines.push(`Total: ${formatCop(draft.total)}`);
  lines.push("", 'Si todo está bien, respóndeme "sí" y registro tu pedido. Si quieres cambiar algo, dímelo con confianza y lo ajustamos.');

  return lines.join("\n");
}

/** A compact, customer-safe view used while the order is still being built. */
export function buildOrderProgressSnapshot(draft: DraftOrder): string {
  const lines = ["🧾 Pedido actual", ""];

  if (draft.items.length === 0) {
    lines.push("Productos: Pendiente");
  } else {
    lines.push("Productos:");
    for (const item of draft.items) {
      lines.push(`• ${item.quantity} x ${formatLineItemLabel(item)} — ${formatCop(item.lineTotal)}`);
    }
  }

  lines.push(`Subtotal: ${formatCop(draft.subtotal)}`);
  lines.push(`Entrega: ${draft.fulfillmentType === "delivery" ? "Domicilio" : draft.fulfillmentType === "pickup" ? "Para recoger" : "Pendiente"}`);

  const address = draft.resolvedDeliveryAddress ?? draft.customerAddressText ?? draft.deliveryAddress;
  lines.push(`Dirección: ${address ?? "Pendiente"}`);
  lines.push(`Indicaciones: ${draft.deliveryAddressDetails ?? "Pendiente"}`);
  lines.push(`Pago: ${draft.paymentMethod === "cash" ? "Efectivo" : draft.paymentMethod === "transfer" ? "Transferencia" : "Pendiente"}`);

  if (!draft.fulfillmentType) {
    lines.push("Total: Pendiente de definir entrega");
  } else {
    lines.push(`Total: ${formatCop(draft.total)}`);
  }

  return lines.join("\n");
}

export function buildClarificationPrompt(state: DraftOrderStateLike): string {
  switch (state) {
    case "awaiting_mode_selection":
      return "Cuéntame qué deseas pedir y con gusto te ayudo a armar tu orden.";
    case "awaiting_guided_item_selection":
      return "Con gusto. Cuéntame qué deseas pedir del menú de hoy; puede ser por nombre o por número.";
    case "awaiting_product_configuration":
      return "Necesito confirmar una opción del producto para continuar con tu pedido.";
    case "awaiting_more_items":
      return "¿Te gustaría agregar algo más o prefieres que sigamos con la entrega?";
    case "awaiting_fulfillment_type":
      return "¿Deseas que sea a domicilio o para recoger?";
    case "awaiting_address":
      return "Por favor, envíame tu ubicación de WhatsApp o escríbeme la dirección para continuar.";
    case "awaiting_billing_reuse_confirmation":
      return "¿La información de facturación sigue igual o quieres cambiarla?";
    case "awaiting_normal_billing_info":
      return "Compárteme tu nombre completo para la factura normal.";
    case "awaiting_electronic_billing_info":
      return "Envíame por favor: nombre o razón social, cédula o NIT y correo electrónico, separados por comas.";
    case "awaiting_payment_method":
      return "¿Prefieres pagar en efectivo o por transferencia?";
    case "awaiting_confirmation":
      return 'Si todo está bien, respóndeme "sí". Si quieres cambiar algo, dime qué ajustamos y con gusto te ayudo.';
    case "awaiting_order_adjustment":
      return "Dime qué productos, cantidades, configuraciones o notas deseas ajustar del pedido actual.";
    case "awaiting_restaurant_confirmation":
      return "Tu pedido sigue en revisión por parte del restaurante 🙌 En cuanto lo confirmen, te escribiré por aquí.";
    case "awaiting_transfer_proof":
      return "Quedo atento al comprobante de transferencia para compartirlo con el restaurante.";
    case "awaiting_transfer_fallback_payment_method":
      return "Si te parece bien, podemos continuar con pago en efectivo. ¿Te funciona así?";
    default:
      return "Cuéntame qué deseas pedir y con gusto te ayudo a armar tu orden.";
  }
}

export function buildManualHandoffMessage(): string {
  return "Claro, con gusto. Voy a ponerte en contacto con alguien del restaurante para que te ayude personalmente.";
}

export function buildMaxClarificationMessage(): string {
  return "Quiero ayudarte bien 😊 Para evitar confusiones, voy a pasarte con alguien del restaurante que pueda continuar contigo.";
}

export function buildTransferProofReceivedMessage(): string {
  return "Perfecto. Ya recibí tu comprobante y se lo compartiré al restaurante para revisión.";
}

export function buildTransferProofAttachmentPrompt(): string {
  return "Claro. Para continuar, por favor envíame una imagen o un PDF del comprobante de transferencia por este mismo chat.";
}

export function buildTransferProofUnsupportedFormatPrompt(): string {
  return "Para revisar la transferencia necesito una imagen o un PDF del comprobante. Si quieres, envíamelo por aquí y con gusto continúo.";
}

export function buildTransferProofProcessingFailedMessage(): string {
  return "Recibí tu mensaje, pero no pude procesar el comprobante automáticamente. Voy a compartirlo con alguien del restaurante para que continúe contigo.";
}

export function buildTransferFallbackPaymentPrompt(): string {
  return [
    "En este momento no tengo un medio de transferencia activo para compartirte.",
    "Si te parece bien, podemos continuar con pago en efectivo. ¿Te funciona así?",
  ].join("\n\n");
}

export function buildTransferFallbackCashConfirmedMessage(): string {
  return [
    "Perfecto 🙌 Entonces dejamos el pago en efectivo.",
    "El restaurante ya puede seguir con tu pedido y, si surge alguna novedad, te escribiré por aquí.",
  ].join("\n\n");
}

export function buildRestaurantReviewPendingMessage(): string {
  return "Tu pedido sigue en revisión por parte del restaurante 🙌 En cuanto lo confirmen, te escribiré por aquí.";
}

export function buildCustomerOrderStatusMessage(order: {
  status: OrderStatus;
  fulfillmentType: "delivery" | "pickup";
}): string {
  switch (order.status) {
    case "pending_restaurant_confirmation":
    case "new":
      return "Tu pedido está siendo revisado por el restaurante. En cuanto confirmen la disponibilidad, te avisaré por aquí.";
    case "needs_customer_replacement":
      return "Estamos esperando que elijas una alternativa para continuar con tu pedido. Revisa las opciones que te enviamos por este chat.";
    case "payment_pending_review":
      return "Ya recibimos tu comprobante y el restaurante está validando el pago. Te avisaré apenas quede confirmado.";
    case "accepted":
    case "preparing":
      return "Tu pedido ya está siendo preparado por nuestro increíble chef. En cuanto esté listo, te avisaré por aquí.";
    case "on_the_way":
      return order.fulfillmentType === "delivery"
        ? "Tu pedido ya salió en camino a tu domicilio. Dentro de poco podrás disfrutarlo. ¡Gracias por la espera!"
        : "Tu pedido ya está listo para que lo recojas y lo disfrutes. ¡Te esperamos!";
    case "delivered":
      return order.fulfillmentType === "delivery"
        ? "Tu pedido fue entregado. Esperamos que lo disfrutes. ¡Gracias por elegirnos!"
        : "Tu pedido fue finalizado. Esperamos que lo hayas disfrutado. ¡Gracias por elegirnos!";
    case "cancelled":
      return "Tu pedido fue cancelado. Si necesitas ayuda o deseas hacer un nuevo pedido, escríbeme y con gusto te ayudo.";
  }
}

export function buildLocationCapturedForLaterMessage(): string {
  return "Perfecto 📍 Ya recibí tu ubicación y la tendré en cuenta cuando sigamos con la entrega.";
}

export function buildContinueWithMenuAndDraftPrompt(menuText: string, draft: DraftOrder): string {
  return [
    menuText,
    "",
    buildCurrentDraftText(draft)
  ].join("\n");
}

export function buildResumeExistingOrderPrompt(draft: DraftOrder, nextPrompt: string): string {
  return [
    "Con gusto, seguimos con tu pedido 😊",
    buildCurrentDraftText(draft),
    nextPrompt,
  ].join("\n\n");
}

export function buildEmptyDraftPrompt(): string {
  return "Aún no tengo productos en tu pedido. Cuéntame, por favor, qué te gustaría pedir.";
}

export function buildPickupPaymentPrompt(menu: TodayMenuPayload, draft: DraftOrder): string {
  return [
    "Perfecto. Entonces quedaría para recoger. 🙌",
    buildPaymentPrompt(draft, menu),
  ].join("\n\n");
}

export function buildAddressSaveFailedPrompt(): string {
  return "No pude guardar bien la dirección. ¿Me la envías de nuevo, por favor? También puedes compartir tu ubicación de WhatsApp.";
}

export function buildAddressSavedPrompt(addressText: string, nextPrompt: string): string {
  return [
    `Perfecto 📍 Tomaré esta dirección: ${addressText}.`,
    "",
    nextPrompt,
  ].join("\n");
}

export function buildNormalBillingPrompt(input: {
  fulfillmentType?: DraftOrder["fulfillmentType"];
  billingAddress?: string;
  electronicBillingEnabled?: boolean;
}): string {
  const electronicBillingHint = input.electronicBillingEnabled === false
    ? ""
    : " Si necesitas factura electrónica, también puedes pedírmela aquí.";

  if (input.fulfillmentType === "delivery" && input.billingAddress) {
    return [
      `Perfecto. Para la factura normal tomaré esta dirección: ${input.billingAddress}.`,
      `Ahora compárteme tu nombre completo.${electronicBillingHint}`,
    ].join("\n\n");
  }

  return `Perfecto. Para continuar, compárteme tu nombre completo para la factura normal.${electronicBillingHint}`;
}

export function buildBillingReusePrompt(input: {
  billingLabel: string;
  detail: string;
}): string {
  return [
    `Tengo guardada tu información de facturación ${input.billingLabel}:`,
    input.detail,
    "",
    "¿La dejamos igual o quieres cambiarla?",
  ].join("\n");
}

export function buildElectronicBillingPrompt(): string {
  return "Claro. Para factura electrónica envíame por favor: nombre o razón social, cédula o NIT y correo electrónico, separados por comas.";
}

export function buildElectronicBillingUnavailableMessage(): string {
  return "Por ahora este restaurante no gestiona facturación electrónica por este chat. Podemos continuar con la factura normal.";
}

export function buildEditableSummaryAdjustmentPrompt(): string {
  return "Claro, con gusto 😊 Dime qué quieres ajustar. Puedes pedirme que agregue, quite o cambie productos.";
}

export function buildProductConfigurationPrompt(
  itemName: string,
  option: ProductOption,
  payload?: {
    invalidValueTexts?: string[];
    ambiguousValueTexts?: string[];
  },
): string {
  const lines: string[] = [];

  if ((payload?.invalidValueTexts?.length ?? 0) > 0) {
    lines.push(`No pude usar esta opción tal como me la indicaste: ${payload?.invalidValueTexts?.join(", ")}.`);
  } else if ((payload?.ambiguousValueTexts?.length ?? 0) > 0) {
    lines.push(`Necesito confirmar mejor esta parte del producto: ${payload?.ambiguousValueTexts?.join(", ")}.`);
  }

  if (option.type === "text") {
    lines.push(`Para continuar con ${itemName}, por favor indícame ${option.name.toLowerCase()}.`);
    return lines.join("\n");
  }

  lines.push(`Para continuar con ${itemName}, necesito que me confirmes tu elección de ${option.name}.`);

  if (option.type === "multiple") {
    const minimum = Math.max(option.isRequired ? 1 : 0, option.minSelect);
    if (minimum > 1 || option.maxSelect > 1) {
      lines.push(`Puedes elegir entre ${minimum} y ${option.maxSelect} opciones.`);
    } else {
      lines.push("Puedes elegir una o varias opciones, separadas por coma.");
    }
  }

  const activeValues = option.values.filter((value) => value.isActive).slice(0, 8);
  if (activeValues.length > 0) {
    lines.push("");
    lines.push(...activeValues.map((value, index) => `${index + 1}. ${value.name}${value.priceDelta !== 0 ? ` — ${formatCop(value.priceDelta)}` : ""}`));
  }

  return lines.join("\n");
}

export function buildOrderSubmittedForReviewMessage(orderId: string, paymentMethod?: PaymentMethod | null): string {
  return [
    `Perfecto 🙌 Ya dejé tu pedido ${orderId.slice(0, 8)} pendiente de revisión por parte del restaurante.`,
    paymentMethod === "transfer"
      ? "Primero validarán la disponibilidad y, si todo está bien, te compartiré por aquí los datos para la transferencia."
      : "En cuanto lo revisen, te confirmaré por este mismo chat.",
  ].join("\n");
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
  | "awaiting_product_configuration"
  | "awaiting_more_items"
  | "awaiting_fulfillment_type"
  | "awaiting_address"
  | "awaiting_billing_reuse_confirmation"
  | "awaiting_normal_billing_info"
  | "awaiting_electronic_billing_info"
  | "awaiting_payment_method"
  | "awaiting_transfer_proof"
  | "awaiting_transfer_fallback_payment_method"
  | "awaiting_confirmation"
  | string;

function formatDraftItemsInline(draft: DraftOrder): string {
  if (draft.items.length === 0) {
    return "un pedido vacío";
  }

  return draft.items
    .map((item) => `- ${item.quantity} x ${formatLineItemLabel(item)}`)
    .join("\n");
}

function formatLineItemLabel(item: Pick<OrderLineItem, "name" | "options" | "notes">): string {
  const optionSummary = item.options?.resolvedOptions
    ?.map((option) => {
      const values = option.selectedValues?.map((value) => value.valueName).join(", ");
      const valueText = values ?? option.textValue;
      return valueText ? `${option.optionName}: ${valueText}` : undefined;
    })
    .filter((entry): entry is string => Boolean(entry))
    .join(" | ");

  const noteSummary = item.notes?.trim() ? `Nota: ${item.notes.trim()}` : undefined;
  const details = [optionSummary, noteSummary].filter((entry): entry is string => Boolean(entry)).join(" | ");
  if (!details) {
    return item.name;
  }

  return `${item.name} (${details})`;
}
