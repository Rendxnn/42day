export type DeliveryAddressTextKind =
  | "structured_address"
  | "location_limitation"
  | "unknown";

export type SegmentedDeliveryAddress = {
  /** Street-level address used for geocoding and coverage validation. */
  addressText: string;
  /** Instructions useful to the courier but not useful to a geocoder. */
  details?: string;
};

export function classifyDeliveryAddressText(text: string): DeliveryAddressTextKind {
  const normalized = normalizeAddressText(text);
  if (!normalized) {
    return "unknown";
  }

  if (looksLikeLocationLimitation(normalized)) {
    return "location_limitation";
  }

  if (looksLikeStructuredAddress(normalized)) {
    return "structured_address";
  }

  return "unknown";
}

/**
 * Keeps the geocodable part of an address separate from delivery instructions.
 * The deterministic split is deliberately conservative: if it cannot identify
 * a delivery-detail marker, it leaves the original text untouched.
 */
export function segmentDeliveryAddress(input: {
  addressText: string;
  details?: string | null;
}): SegmentedDeliveryAddress {
  const rawAddress = cleanAddressPart(input.addressText);
  const explicitDetails = cleanAddressPart(input.details ?? "");
  if (!rawAddress) {
    return { addressText: "", ...(explicitDetails ? { details: explicitDetails } : {}) };
  }

  if (explicitDetails) {
    // A Colombian street number such as "#42 99" is occasionally returned
    // by the model as a detail. It belongs to the street address instead.
    if (looksLikeDetachedStreetNumber(explicitDetails) && !hasStreetNumber(rawAddress)) {
      return segmentDeliveryAddress({
        addressText: `${rawAddress} ${explicitDetails}`,
      });
    }
    return { addressText: rawAddress, details: explicitDetails };
  }

  const match = rawAddress.match(/(?:^|[,;.\n]|\s)(apto\.?|apartamento|interior|piso|torre|bloque|unidad|urbanizaci[oó]n|conjunto|edificio|porter[ií]a|entrada|casa|local|referencia|indicaciones?|al lado de|frente a)\b/i);
  if (!match || match.index === undefined || match.index === 0) {
    return { addressText: rawAddress };
  }

  const addressText = cleanAddressPart(rawAddress.slice(0, match.index));
  const details = cleanAddressPart(rawAddress.slice(match.index));
  return {
    addressText: addressText || rawAddress,
    ...(addressText && details ? { details } : {}),
  };
}

function looksLikeLocationLimitation(text: string) {
  return [
    /no puedo (enviar|mandar|compartir) (mi )?(ubicacion|ubicación|localizacion|localización|gps)/,
    /no tengo (ubicacion|ubicación|gps|localizacion|localización)/,
    /mi celular no tiene (ubicacion|ubicación|gps|localizacion|localización)/,
    /no me deja (enviar|compartir) (la )?(ubicacion|ubicación|localizacion|localización)/,
    /sin (ubicacion|ubicación|gps|localizacion|localización)/,
  ].some((pattern) => pattern.test(text));
}

function looksLikeStructuredAddress(text: string) {
  const hasStreetKeyword = /\b(calle|cl|cra|cr|carrera|kr|k|avenida|av|diagonal|dg|transversal|tv|transv|manzana|mz|barrio|urbanizacion|urbanización|vereda|sector|casa|torre|bloque|apto|apartamento|edificio|local)\b/.test(text);
  const hasPlaceSeparator = /[#,\-]/.test(text);
  const hasAddressNumber = /\d/.test(text);
  const hasPlaceReference = /\b(sabaneta|medellin|medellín|envigado|itagui|itagüí|bello|la estrella|caldas|copacabana|girardota|municipio|ciudad|barrio|sector|vereda)\b/.test(text);

  if (hasStreetKeyword && hasAddressNumber) {
    return true;
  }

  if (hasStreetKeyword && hasPlaceSeparator) {
    return true;
  }

  if (hasPlaceReference && hasAddressNumber && text.length >= 10) {
    return true;
  }

  return false;
}

function normalizeAddressText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanAddressPart(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[,;.\-–—\s]+|[,;.\-–—\s]+$/g, "")
    .trim();
}

function hasStreetNumber(value: string) {
  return /#\s*\d/.test(value);
}

function looksLikeDetachedStreetNumber(value: string) {
  return /^#\s*\d+(?:\s*[-–—]?\s*\d+)+\b/.test(value);
}
