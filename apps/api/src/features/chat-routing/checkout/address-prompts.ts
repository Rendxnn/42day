import { buildDeliveryAddressPrompt } from "../../../modules/message-router/response-composer";

export function buildCoverageRequestMessage(input?: {
  requestLocationMessage?: string;
  tryGeocodeWrittenAddresses?: boolean;
}): string {
  const baseMessage = input?.requestLocationMessage?.trim() || buildDeliveryAddressPrompt();
  if (input?.tryGeocodeWrittenAddresses === false) return baseMessage;
  if (/\b(apto|apartamento|torre|unidad|detalle|indicaci[oó]n|referencia)\b/i.test(baseMessage)) return baseMessage;

  return `${baseMessage}\n\nSi prefieres escribirla, envíame en un solo mensaje la dirección completa (calle o carrera, número, barrio y municipio) e incluye apartamento, torre, unidad, casa o una referencia si aplica.`;
}

export function buildWrittenAddressHelpPrompt(): string {
  return [
    "No hay problema.",
    "Envíame en un solo mensaje la dirección completa: calle o carrera, número, barrio y municipio. Incluye apartamento, torre, unidad, casa o referencia si aplica.",
    'Ejemplo: "Calle 74 Sur #35-145, barrio X, Sabaneta. Torre 2, apto 301, portería."',
  ].join("\n\n");
}

export function buildAddressValidationRetryPrompt(): string {
  return [
    "No logré identificar con claridad la dirección para validar la cobertura.",
    "Envíamela nuevamente en un solo mensaje con calle o carrera, número, barrio y municipio; agrega apartamento, torre, unidad, casa o referencia si aplica.",
    "Si prefieres, también puedes enviarme la ubicación de WhatsApp.",
  ].join("\n\n");
}
