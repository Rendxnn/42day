import type { Conversation, DraftOrder, NormalizedInboundMessage, PaymentMethod } from "@42day/types";
import { hasNearToken, includesAny, normalizeText } from "./message-normalizer.ts";

export type DetectedSignals = {
  normalizedText: string;
  numericSelection: number | null;
  isGreeting: boolean;
  wantsMenu: boolean;
  humanRequested: boolean;
  fulfillmentType: DraftOrder["fulfillmentType"] | null;
  paymentMethod: PaymentMethod | null;
  confirmation: "yes" | "no" | "change" | null;
  wantsElectronicBilling: boolean;
  billingDataChanged: boolean;
  looksLikeAddress: boolean;
  hasTransferProofCandidate: boolean;
  shouldTrySemanticOrder: boolean;
  doneAddingItems: boolean;
};

export function detectSignals(input: {
  message: NormalizedInboundMessage;
  state: Conversation["state"];
}): DetectedSignals {
  const text = normalizeText(input.message.text);
  const paymentMethod = parsePaymentMethod(text, input.state);
  const fulfillmentType = parseFulfillmentSelection(text, input.state);
  const confirmation = parseConfirmation(text);
  const doneAddingItems = parseDoneAddingItems(text);

  return {
    normalizedText: text,
    numericSelection: parseNumericSelection(text),
    isGreeting: matchesGreeting(text),
    wantsMenu: wantsMenu(text),
    humanRequested: wantsHuman(text),
    fulfillmentType,
    paymentMethod,
    confirmation,
    wantsElectronicBilling: wantsElectronicBilling(text),
    billingDataChanged: wantsBillingDataChange(text),
    looksLikeAddress: looksLikeAddressText(text, {
      fulfillmentType,
      paymentMethod,
      confirmation,
      doneAddingItems,
    }),
    hasTransferProofCandidate: input.message.type === "image" || input.message.type === "document" || includesAny(text, ["comprobante", "ya pague", "pago listo"]),
    shouldTrySemanticOrder: shouldTrySemanticOrder(text),
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

  if (
    includesAny(text, ["domicilio", "delivery", "envio", "a domicilio", "domi", "domicilo"]) ||
    hasNearToken(text, "domicilio", 2)
  ) {
    return "delivery";
  }

  if (includesAny(text, ["pickup", "recoger", "recogida", "retiro", "tienda", "paso por el", "paso por la"])) {
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

  if (
    includesAny(text, ["efectivo", "cash", "contra entrega", "efectvo", "efectibo"]) ||
    hasNearToken(text, "efectivo", 2)
  ) {
    return "cash";
  }

  if (
    includesAny(text, ["transferencia", "transferir", "trasnferencia", "transfe", "nequi", "daviplata"]) ||
    hasNearToken(text, "transferencia", 2)
  ) {
    return "transfer";
  }

  return null;
}

export function parseConfirmation(text: string): "yes" | "no" | "change" | null {
  if (!text) {
    return null;
  }

  if (/^(no|nop|nope)$/.test(text) || /(^|\s)(cancelar|cancela|no asi|no,? asi no)($|\s)/.test(text)) {
    return "no";
  }

  if (/(^|\s)(cambiar|cambio|corregir|editar|ajustar|cambiemos|quita|quitar|quitemos|cambia|cambiame|agrega|agregar|agregame|sumale|suma)($|\s)/.test(text)) {
    return "change";
  }

  if (/^(si|sii|sip|confirmo|confirmado|correcto|dale|listo|ok|okay)(\s|$)/.test(text)) {
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

function shouldTrySemanticOrder(text: string): boolean {
  if (!text) {
    return false;
  }

  return (
    /\b(con|sin|pero|y|tambien|ademas|otro|otra|otros|otras)\b/.test(text) ||
    /\b(quiero|dame|deme|me regalas|regalame|mandame|necesito|agrega|agregame|agregar|sumale|suma|quita|quitar|quitemos|cambia|cambiame|cambiemos|reemplaza|reemplazame)\b/.test(text) ||
    /\b(que|cual|cuales|cuanto|cuantos|como|tienen|hay|trae|incluye|viene|puedo|podria|recomiendas|recomiendame)\b/.test(text)
  );
}

function parseDoneAddingItems(text: string): boolean {
  if (!text) {
    return false;
  }

  return (
    /^(no|nop|nope|ya|listo|dale|ok|okay)$/.test(text) ||
    /\b(eso es todo|asi esta bien|nada mas|no mas|no quiero mas|sigamos|continua|continuemos|sigue|seguir|ya no)\b/.test(text)
  );
}

function looksLikeAddressText(
  text: string,
  parsed: Pick<DetectedSignals, "fulfillmentType" | "paymentMethod" | "confirmation" | "doneAddingItems">,
): boolean {
  if (!text) {
    return false;
  }

  if (parsed.fulfillmentType || parsed.paymentMethod || parsed.confirmation || parsed.doneAddingItems) {
    return false;
  }

  return text.length >= 8;
}

function parseNumericSelection(text: string): number | null {
  const match = text.match(/^\s*(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

function matchesGreeting(text: string): boolean {
  return ["hola", "buenas", "buenos dias", "buen dia", "buenas tardes", "buenas noches", "hey", "holi"].includes(text);
}
