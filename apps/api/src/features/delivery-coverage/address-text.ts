export type DeliveryAddressTextKind =
  | "structured_address"
  | "location_limitation"
  | "unknown";

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
