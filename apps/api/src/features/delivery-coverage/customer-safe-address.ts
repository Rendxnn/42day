export const WHATSAPP_LOCATION_LABEL = "Ubicación compartida por WhatsApp";

const GENERATED_LOCATION_PREFIX = /^\s*ubicaci[oó]n compartida\s*:\s*/i;
const COORDINATE_PAIR = /^\s*[+-]?\d{1,3}(?:\.\d+)?\s*[,;]\s*[+-]?\d{1,3}(?:\.\d+)?\s*$/;

/**
 * Coordinates belong in their numeric database fields, not in customer-facing
 * address or billing copy.
 */
export function toCustomerSafeAddress(value: string | null | undefined): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;

  const withoutGeneratedPrefix = candidate.replace(GENERATED_LOCATION_PREFIX, "");
  if (COORDINATE_PAIR.test(withoutGeneratedPrefix)) return undefined;

  return candidate;
}
