import type { Conversation, DraftOrder, NormalizedInboundMessage, PaymentMethod } from "@42day/types";
import { classifyDeliveryAddressText } from "../../features/delivery-coverage/address-text.ts";
import { includesAny, normalizeText } from "./message-normalizer.ts";

export type DetectedSignals = {
  normalizedText: string;
  numericSelection: number | null;
  isGreeting: boolean;
  wantsMenu: boolean;
  wantsOrderStatus: boolean;
  humanRequested: boolean;
  fulfillmentType: DraftOrder["fulfillmentType"] | null;
  paymentMethod: PaymentMethod | null;
  confirmation: "yes" | "no" | "change" | null;
  wantsElectronicBilling: boolean;
  billingDataChanged: boolean;
  looksLikeAddress: boolean;
  cannotShareLocation: boolean;
  hasTransferProofCandidate: boolean;
  doneAddingItems: boolean;
};

export function detectSignals(input: {
  message: NormalizedInboundMessage;
  state: Conversation["state"];
}): DetectedSignals {
  const text = normalizeText(input.message.text);
  const paymentMethod = parsePaymentMethod(text, input.state);
  const fulfillmentType = parseFulfillmentSelection(text, input.state);
  const confirmation = parseConfirmation(text, input.state);
  const doneAddingItems = parseDoneAddingItems(text);
  const deliveryAddressKind = classifyDeliveryAddressText(text);

  return {
    normalizedText: text,
    numericSelection: parseNumericSelection(text),
    isGreeting: matchesGreeting(text),
    wantsMenu: wantsMenu(text),
    wantsOrderStatus: wantsOrderStatus(text),
    humanRequested: wantsHuman(text),
    fulfillmentType,
    paymentMethod,
    confirmation,
    wantsElectronicBilling: wantsElectronicBilling(text),
    billingDataChanged: wantsBillingDataChange(text),
    looksLikeAddress: looksLikeAddressText(deliveryAddressKind, {
      fulfillmentType,
      paymentMethod,
      confirmation,
      doneAddingItems,
    }),
    cannotShareLocation: deliveryAddressKind === "location_limitation",
    hasTransferProofCandidate: input.message.type === "image" || input.message.type === "document" || includesAny(text, ["comprobante", "ya pague", "pago listo"]),
    doneAddingItems,
  };
}

export function parseFulfillmentSelection(
  text: string,
  state: Conversation["state"],
): DraftOrder["fulfillmentType"] | null {
  if (!text) {
    return null;
  }

  if (state === "awaiting_fulfillment_type") {
    if (text === "1") {
      return "delivery";
    }

    if (text === "2") {
      return "pickup";
    }
  }

  if (![
    "awaiting_fulfillment_type",
    "awaiting_more_items",
    "awaiting_confirmation",
  ].includes(state)) {
    return null;
  }

  if (["domicilio", "delivery", "envio", "a domicilio"].includes(text)) {
    return "delivery";
  }

  if (["pickup", "recoger", "recogida", "retiro"].includes(text)) {
    return "pickup";
  }

  return null;
}

export function parsePaymentMethod(text: string, state: Conversation["state"]): PaymentMethod | null {
  if (!text) {
    return null;
  }

  if (state === "awaiting_payment_method") {
    if (text === "1") {
      return "cash";
    }

    if (text === "2") {
      return "transfer";
    }
  }

  if (state !== "awaiting_payment_method" && state !== "awaiting_transfer_fallback_payment_method") {
    return null;
  }

  if (["efectivo", "cash", "contra entrega"].includes(text)) {
    return "cash";
  }

  if (["transferencia", "nequi", "daviplata"].includes(text)) {
    return "transfer";
  }

  return null;
}

/**
 * Semantic output is already an interpreted candidate. This mapper only accepts
 * canonical payment labels and intentionally does not run the broad text matcher.
 */
export function parseSemanticPaymentMethod(text: string): PaymentMethod | null {
  const normalized = normalizeText(text);
  if (["efectivo", "cash", "contra entrega"].includes(normalized)) return "cash";
  if (["transferencia", "nequi", "daviplata"].includes(normalized)) return "transfer";
  return null;
}

/** See parseSemanticPaymentMethod: semantic candidates still need canonical mapping. */
export function parseSemanticFulfillmentSelection(text: string): DraftOrder["fulfillmentType"] | null {
  const normalized = normalizeText(text);
  if (["domicilio", "delivery", "envio", "a domicilio"].includes(normalized)) return "delivery";
  if (["pickup", "recoger", "recogida", "retiro"].includes(normalized)) return "pickup";
  return null;
}

export function parseConfirmation(text: string, state: Conversation["state"]): "yes" | "no" | "change" | null {
  if (!text) {
    return null;
  }

  if (![
    "awaiting_confirmation",
    "awaiting_order_adjustment",
    "awaiting_transfer_fallback_payment_method",
  ].includes(state)) {
    return null;
  }

  if (["no", "nop", "nope", "cancelar"].includes(text)) {
    return "no";
  }

  if (["cambiar", "corregir", "editar", "ajustar"].includes(text)) {
    return "change";
  }

  if (["si", "sii", "sip", "confirmo", "confirmado", "correcto", "dale", "listo", "ok", "okay"].includes(text)) {
    return "yes";
  }

  return null;
}

function wantsHuman(text: string): boolean {
  return includesAny(text, ["asesor", "humano", "persona", "alguien del restaurante", "hablar con alguien"]);
}

function wantsElectronicBilling(text: string): boolean {
  return includesAny(text, [
    "factura electronica",
    "factura electrónica",
    "facturacion electronica",
    "facturación electrónica",
    "razon social",
    "razón social",
    "nit",
    "cedula",
    "cédula",
    "correo",
  ]);
}

function wantsBillingDataChange(text: string): boolean {
  return includesAny(text, [
    "cambio la factura",
    "cambiaron los datos",
    "datos cambiaron",
    "hay cambios",
    "cambiar datos",
    "cambiar factura",
  ]);
}

function wantsMenu(text: string): boolean {
  if (!text) {
    return false;
  }

  if (/(^|\s)(ver menu|muestrame el menu|que hay hoy|carta)($|\s)/.test(text)) {
    return true;
  }

  return text === "menu" || text === "menú" || text === "pedido guiado" || text === "guiado" || text === "hacer pedido";
}

function parseDoneAddingItems(text: string): boolean {
  if (!text) {
    return false;
  }

  return (
    ["no", "nop", "nope", "ya", "listo", "dale", "ok", "okay", "eso es todo", "nada mas", "no mas", "sigamos", "continua", "continuemos"].includes(text)
  );
}

function looksLikeAddressText(
  deliveryAddressKind: ReturnType<typeof classifyDeliveryAddressText>,
  parsed: Pick<DetectedSignals, "fulfillmentType" | "paymentMethod" | "confirmation" | "doneAddingItems">,
): boolean {
  if (parsed.fulfillmentType || parsed.paymentMethod || parsed.confirmation || parsed.doneAddingItems) {
    return false;
  }

  return deliveryAddressKind === "structured_address";
}

function wantsOrderStatus(text: string): boolean {
  return [
    /como va (mi |el )?pedido/,
    /como va (mi |la )?orden/,
    /estado (de )?(mi |el )?pedido/,
    /donde va (mi |el )?pedido/,
    /cuando (llega|sale) (mi |el )?pedido/,
    /mi pedido (ya )?(salio|llego|esta listo|va en camino)/,
  ].some((pattern) => pattern.test(text));
}

function parseNumericSelection(text: string): number | null {
  const match = text.match(/^\s*(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

function matchesGreeting(text: string): boolean {
  return ["hola", "buenas", "buenos dias", "buen dia", "buenas tardes", "buenas noches", "hey", "holi"].includes(text);
}
