import { includesAny, normalizeText } from "../../../modules/message-router/message-normalizer.ts";

export function hasExplicitFulfillmentEvidence(
  rawMessage: string | undefined,
  fulfillmentType: "delivery" | "pickup",
  conversationState: string,
): boolean {
  const text = normalizeText(rawMessage);
  if (conversationState === "awaiting_fulfillment_type") {
    if (fulfillmentType === "delivery" && text === "1") return true;
    if (fulfillmentType === "pickup" && text === "2") return true;
  }
  return fulfillmentType === "delivery"
    ? includesAny(text, ["domicilio", "a domicilio", "delivery", "envio", "enviar a", "llevar a"])
    : includesAny(text, ["recoger", "recojo", "recogida", "pickup", "retiro", "paso por", "en el local"]);
}

export function hasExplicitPaymentEvidence(
  rawMessage: string | undefined,
  paymentMethod: "cash" | "transfer",
  conversationState: string,
): boolean {
  const text = normalizeText(rawMessage);
  if (conversationState === "awaiting_payment_method") {
    if (paymentMethod === "cash" && text === "1") return true;
    if (paymentMethod === "transfer" && text === "2") return true;
  }
  return paymentMethod === "cash"
    ? includesAny(text, ["efectivo", "cash", "contra entrega"])
    : includesAny(text, ["transferencia", "transferir", "nequi", "daviplata"]);
}
