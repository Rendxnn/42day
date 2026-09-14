import type { DynamicLinkDestinationType, DynamicLinkStatus } from "@42day/types";

export const DYNAMIC_LINK_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const DYNAMIC_LINK_CODE_LENGTH = 12;
export const GOOGLE_REVIEW_URL_MAX_LENGTH = 2_048;

const GOOGLE_MAPS_FEATURE_ID_PATTERN = /^0x[0-9a-f]{1,32}:0x[0-9a-f]{1,32}$/i;
const GOOGLE_MAPS_HOSTS = new Set(["google.com", "www.google.com", "maps.google.com"]);
const GOOGLE_SEARCH_HOST = "search.google.com";

export type GoogleReviewUrlClassification =
  | { kind: "maps_short_link" | "maps_business_url" | "direct_review_url"; normalizedUrl: string }
  | { kind: "unsupported" };

export type GoogleMapsFeatureIdExtraction =
  | { kind: "found"; featureId: string }
  | { kind: "missing" | "ambiguous" };

const PUBLIC_DESTINATION_TYPES = new Set<DynamicLinkDestinationType>([
  "google_review",
  "website",
  "menu",
  "whatsapp",
  "instagram",
]);

const terminalStatuses = new Set<DynamicLinkStatus>(["archived"]);

export class DynamicLinkValidationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export function normalizeDynamicLinkCode(value: string) {
  return value.trim().toUpperCase();
}

export function isDynamicLinkCode(value: string) {
  return new RegExp(`^[${DYNAMIC_LINK_CODE_ALPHABET}]{${DYNAMIC_LINK_CODE_LENGTH}}$`).test(value);
}

export function generateDynamicLinkCode(randomValues: Uint8Array) {
  if (randomValues.length < DYNAMIC_LINK_CODE_LENGTH) {
    throw new DynamicLinkValidationError("dynamic_link_random_values_insufficient");
  }

  let code = "";
  for (let index = 0; index < DYNAMIC_LINK_CODE_LENGTH; index += 1) {
    code += DYNAMIC_LINK_CODE_ALPHABET[randomValues[index]! % DYNAMIC_LINK_CODE_ALPHABET.length]!;
  }
  return code;
}

export function buildDynamicLinkUrl(baseUrl: string, publicCode: string) {
  const code = normalizeDynamicLinkCode(publicCode);
  if (!isDynamicLinkCode(code)) {
    throw new DynamicLinkValidationError("dynamic_link_code_invalid");
  }

  const base = new URL(baseUrl);
  if (base.protocol !== "https:") {
    throw new DynamicLinkValidationError("dynamic_link_base_url_invalid");
  }
  return new URL(`/r/${code}`, base).toString();
}

/**
 * Extracts a ParaHoy physical-link code without ever following the scanned URL.
 * A scanner may provide either the code itself or the canonical permanent URL.
 */
export function parseDynamicLinkReference(value: string, baseUrl: string) {
  const sanitizedValue = value.trim().replace(/[\u200B-\u200D\uFEFF]/g, "");
  const directCode = normalizeDynamicLinkCode(sanitizedValue);
  if (isDynamicLinkCode(directCode)) return directCode;

  let scannedUrl: URL;
  let expectedBase: URL;
  try {
    expectedBase = new URL(baseUrl);
    const hostOnlyReference = sanitizedValue.split("/", 1)[0]?.toLowerCase() === expectedBase.host.toLowerCase();
    scannedUrl = new URL(hostOnlyReference ? `${expectedBase.protocol}//${sanitizedValue}` : sanitizedValue);
  } catch {
    throw new DynamicLinkValidationError("dynamic_link_reference_invalid");
  }

  const segments = scannedUrl.pathname.split("/").filter(Boolean);
  const code = segments.length === 2 && segments[0] === "r" ? normalizeDynamicLinkCode(segments[1]!) : "";
  if (
    expectedBase.protocol !== "https:"
    || scannedUrl.protocol !== "https:"
    || scannedUrl.origin !== expectedBase.origin
    || scannedUrl.search
    || scannedUrl.hash
    || !isDynamicLinkCode(code)
  ) {
    throw new DynamicLinkValidationError("dynamic_link_reference_invalid");
  }
  return code;
}

export function classifyGoogleReviewUrl(value: string): GoogleReviewUrlClassification {
  const sanitizedValue = sanitizeCopiedUrl(value);
  if (!sanitizedValue || sanitizedValue.length > GOOGLE_REVIEW_URL_MAX_LENGTH) return { kind: "unsupported" };

  let url: URL;
  try {
    url = new URL(sanitizedValue);
  } catch {
    return { kind: "unsupported" };
  }

  const hostname = normalizeHostname(url.hostname);
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.port
    || !hostname
    || isLocalOrIpHost(hostname)
  ) {
    return { kind: "unsupported" };
  }

  if (hostname === "maps.app.goo.gl" && hasNonRootPath(url)) {
    return { kind: "maps_short_link", normalizedUrl: url.toString() };
  }
  if (hostname === "goo.gl" && /^\/maps(?:\/|$)/i.test(url.pathname)) {
    return { kind: "maps_short_link", normalizedUrl: url.toString() };
  }
  if (hostname === "g.page" && hasNonRootPath(url)) {
    const path = url.pathname.replace(/\/+$/, "");
    return {
      kind: path.toLowerCase().endsWith("/review") ? "direct_review_url" : "maps_short_link",
      normalizedUrl: url.toString(),
    };
  }

  if (hostname === GOOGLE_SEARCH_HOST) {
    const placeId = url.searchParams.get("placeid") ?? "";
    if (url.pathname === "/local/writereview" && /^[A-Za-z0-9_-]{5,256}$/.test(placeId)) {
      return { kind: "direct_review_url", normalizedUrl: url.toString() };
    }
    return { kind: "unsupported" };
  }

  if (!GOOGLE_MAPS_HOSTS.has(hostname) || !(url.pathname === "/maps" || url.pathname.startsWith("/maps/"))) {
    return { kind: "unsupported" };
  }

  return {
    kind: containsGoogleReviewAction(url) ? "direct_review_url" : "maps_business_url",
    normalizedUrl: url.toString(),
  };
}

export function extractGoogleMapsFeatureId(value: string): GoogleMapsFeatureIdExtraction {
  let url: URL;
  try {
    url = new URL(sanitizeCopiedUrl(value));
  } catch {
    return { kind: "missing" };
  }

  const candidates = new Set<string>();
  for (const ftid of url.searchParams.getAll("ftid")) {
    addFeatureIdCandidate(candidates, ftid);
  }

  const decodedUrl = safeDecodeURIComponent(url.toString());
  const tokenPattern = /!1s(0x[0-9a-f]{1,32}:0x[0-9a-f]{1,32})(?=!|$|[/?#&])/gi;
  for (const match of decodedUrl.matchAll(tokenPattern)) {
    addFeatureIdCandidate(candidates, match[1] ?? "");
  }

  if (candidates.size === 0) return { kind: "missing" };
  if (candidates.size > 1) return { kind: "ambiguous" };
  return { kind: "found", featureId: [...candidates][0]! };
}

export function buildGoogleReviewUrl(featureId: string) {
  const normalizedFeatureId = featureId.trim().toLowerCase();
  if (!GOOGLE_MAPS_FEATURE_ID_PATTERN.test(normalizedFeatureId)) {
    throw new DynamicLinkValidationError("google_review_identifier_invalid");
  }
  return `https://www.google.com/maps/place//data=!4m3!3m2!1s${normalizedFeatureId}!12e1`;
}

export function isDirectGoogleReviewUrl(value: string) {
  return classifyGoogleReviewUrl(value).kind === "direct_review_url";
}

export function inferDynamicLinkDestinationType(input: {
  url: string;
  publicMenuHost: string;
}): DynamicLinkDestinationType {
  let destination: URL;
  try {
    destination = new URL(input.url.trim());
  } catch {
    throw new DynamicLinkValidationError("dynamic_link_destination_url_invalid");
  }

  const hostname = destination.hostname.toLowerCase().replace(/\.$/, "");
  if (isOfficialHost(hostname, ["google.com", "g.page", "maps.app", "goo.gl"])) return "google_review";
  if (isOfficialHost(hostname, ["wa.me", "whatsapp.com"])) return "whatsapp";
  if (isOfficialHost(hostname, ["instagram.com"])) return "instagram";
  if (hostname === input.publicMenuHost.toLowerCase().replace(/\.$/, "") && (destination.pathname === "/carta" || destination.pathname.startsWith("/carta/"))) return "menu";
  return "website";
}

export function validateDynamicLinkDestination(input: {
  type: DynamicLinkDestinationType;
  url: string;
  redirectHost: string;
}) {
  if (!PUBLIC_DESTINATION_TYPES.has(input.type)) {
    throw new DynamicLinkValidationError("dynamic_link_destination_type_invalid");
  }

  let destination: URL;
  try {
    destination = new URL(input.url.trim());
  } catch {
    throw new DynamicLinkValidationError("dynamic_link_destination_url_invalid");
  }

  const hostname = destination.hostname.toLowerCase().replace(/\.$/, "");
  const redirectHost = input.redirectHost.toLowerCase().replace(/\.$/, "");
  if (
    destination.protocol !== "https:" ||
    destination.username ||
    destination.password ||
    !hostname ||
    hostname === redirectHost ||
    isLocalOrIpHost(hostname)
  ) {
    throw new DynamicLinkValidationError("dynamic_link_destination_url_unsafe");
  }

  if (!hostAllowedForDestinationType(input.type, hostname)) {
    throw new DynamicLinkValidationError("dynamic_link_destination_host_not_allowed");
  }

  return destination.toString();
}

export function canTransitionDynamicLinkStatus(from: DynamicLinkStatus, to: DynamicLinkStatus) {
  if (terminalStatuses.has(from)) return false;
  if (from === to) return true;
  if (to === "archived") return true;
  if (from === "available") return to === "active" || to === "suspended";
  if (from === "active") return to === "suspended";
  return from === "suspended" && to === "active";
}

function hostAllowedForDestinationType(type: DynamicLinkDestinationType, hostname: string) {
  if (type === "website" || type === "menu") return true;
  if (type === "google_review") return isOfficialHost(hostname, ["google.com", "g.page", "maps.app", "goo.gl"]);
  if (type === "whatsapp") return isOfficialHost(hostname, ["wa.me", "whatsapp.com"]);
  return isOfficialHost(hostname, ["instagram.com"]);
}

function isOfficialHost(hostname: string, roots: string[]) {
  return roots.some((root) => hostname === root || hostname.endsWith(`.${root}`));
}

function sanitizeCopiedUrl(value: string) {
  return value.trim().replace(/[\u200B-\u200D\uFEFF]/g, "");
}

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function hasNonRootPath(url: URL) {
  return url.pathname.split("/").some(Boolean);
}

function containsGoogleReviewAction(url: URL) {
  return /(?:^|!)12e1(?:!|$|[/?#&])/.test(safeDecodeURIComponent(`${url.pathname}${url.search}${url.hash}`));
}

function addFeatureIdCandidate(candidates: Set<string>, value: string) {
  const normalized = value.trim().toLowerCase();
  if (GOOGLE_MAPS_FEATURE_ID_PATTERN.test(normalized)) candidates.add(normalized);
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isLocalOrIpHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.includes(":") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
  );
}
