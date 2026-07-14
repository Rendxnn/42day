import { buildDeliveryAddressPrompt } from "../../../modules/message-router/response-composer";

export function buildCoverageRequestMessage(input?: {
  requestLocationMessage?: string;
  tryGeocodeWrittenAddresses?: boolean;
}): string {
  const baseMessage = input?.requestLocationMessage?.trim() || buildDeliveryAddressPrompt();
  if (input?.tryGeocodeWrittenAddresses === false || /\bdireccion\b|\bdirección\b/i.test(baseMessage)) {
    return baseMessage;
  }

  return `${baseMessage}\n\nSi no puedes compartir la ubicación, también puedes escribirme la dirección completa para validarla.`;
}

export function buildWrittenAddressHelpPrompt(): string {
  return [
    "No hay problema.",
    "Si no puedes compartir tu ubicación, escríbeme la dirección lo más completa posible: calle o carrera, número, barrio y municipio.",
    'Ejemplo: "Calle 74 Sur #35-145, barrio X, Sabaneta".',
  ].join("\n\n");
}

export function buildAddressValidationRetryPrompt(): string {
  return [
    "No pude validar esa dirección con suficiente claridad.",
    "Por favor escríbemela más completa, incluyendo calle o carrera, número, barrio y municipio.",
    "Si prefieres, tambiÃ©n puedes enviarme la ubicaciÃ³n de WhatsApp.",
  ].join("\n\n");
}
