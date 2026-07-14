import { buildDeliveryAddressPrompt } from "../../../modules/message-router/response-composer";

export function buildCoverageRequestMessage(input?: {
  requestLocationMessage?: string;
  tryGeocodeWrittenAddresses?: boolean;
}): string {
  const baseMessage = input?.requestLocationMessage?.trim() || buildDeliveryAddressPrompt();
  if (/\bdireccion\b|\bdirección\b/i.test(baseMessage)) {
    return baseMessage;
  }

  return `${baseMessage}\n\nSi no puedes compartir la ubicaciÃ³n, tambiÃ©n puedes escribirme la direcciÃ³n completa para validarla.`;
}

export function buildWrittenAddressHelpPrompt(): string {
  return [
    "No hay problema.",
    "Si no puedes compartir tu ubicaciÃ³n, escrÃ­beme la direcciÃ³n lo mÃ¡s completa posible: calle o carrera, nÃºmero, barrio y municipio.",
    'Ejemplo: "Calle 74 Sur #35-145, barrio X, Sabaneta".',
  ].join("\n\n");
}

export function buildAddressValidationRetryPrompt(): string {
  return [
    "No pude validar esa direcciÃ³n con suficiente claridad.",
    "Por favor escrÃ­bemela mÃ¡s completa, incluyendo calle o carrera, nÃºmero, barrio y municipio.",
    "Si prefieres, tambiÃ©n puedes enviarme la ubicaciÃ³n de WhatsApp.",
  ].join("\n\n");
}
