import { isDirectGoogleReviewUrl, normalizeBusinessProfileLink, slugifyBusinessProfile as coreSlugifyBusinessProfile } from "@42day/core";
import type { BusinessProfileLink, BusinessProfileLinkKind, CreateBusinessProfileRequest, UpdateBusinessProfileRequest } from "@42day/types";

const LINK_KINDS = new Set<BusinessProfileLinkKind>([
  "menu", "google_review", "instagram", "tiktok", "website", "whatsapp", "phone", "facebook", "maps", "survey", "custom",
]);

export class BusinessProfileValidationError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}

export function slugifyBusinessProfile(value: string) {
  return coreSlugifyBusinessProfile(value);
}

export function parseCreateBusinessProfile(value: unknown): CreateBusinessProfileRequest {
  if (!isRecord(value) || typeof value.requestId !== "string" || !isUuid(value.requestId)) throw new BusinessProfileValidationError("business_profile_request_invalid");
  const displayName = parseText(value.displayName, 160, "business_profile_display_name_invalid");
  const slug = value.slug === undefined ? slugifyBusinessProfile(displayName) : parseSlug(value.slug);
  if (!slug) throw new BusinessProfileValidationError("business_profile_slug_invalid");
  return {
    requestId: value.requestId,
    slug,
    displayName,
    headline: parseOptionalText(value.headline, 180),
    locationName: parseOptionalText(value.locationName, 160),
    address: parseOptionalText(value.address, 500),
    tenantId: value.tenantId === null ? null : value.tenantId === undefined ? undefined : parseUuid(value.tenantId, "business_profile_tenant_invalid"),
  };
}

export function parseUpdateBusinessProfile(value: unknown): UpdateBusinessProfileRequest {
  if (!isRecord(value) || !Number.isInteger(value.revision) || Number(value.revision) < 1) throw new BusinessProfileValidationError("business_profile_revision_invalid");
  const linksValue = value.links;
  if (!Array.isArray(linksValue) || linksValue.length > 30) throw new BusinessProfileValidationError("business_profile_links_invalid");
  return {
    revision: Number(value.revision),
    displayName: parseText(value.displayName, 160, "business_profile_display_name_invalid"),
    headline: parseOptionalText(value.headline, 180),
    locationName: parseOptionalText(value.locationName, 160),
    address: parseOptionalText(value.address, 500),
    links: linksValue.map((link, index) => normalizeLink(link, index)),
  };
}

export function normalizeLink(value: unknown, index = 0): BusinessProfileLink {
  if (!isRecord(value) || typeof value.kind !== "string" || !LINK_KINDS.has(value.kind as BusinessProfileLinkKind)) throw new BusinessProfileValidationError("business_profile_link_kind_invalid");
  const kind = value.kind as BusinessProfileLinkKind;
  const label = value.label === undefined || value.label === null ? undefined : parseText(value.label, 120, "business_profile_link_label_invalid");
  if (typeof value.enabled !== "boolean") throw new BusinessProfileValidationError("business_profile_link_enabled_invalid");
  const sortOrder = value.sortOrder === undefined ? index * 10 + 10 : Number(value.sortOrder);
  if (!Number.isInteger(sortOrder) || sortOrder < 0) throw new BusinessProfileValidationError("business_profile_link_order_invalid");
  const href = normalizeLinkHref(kind, value.href);
  return { id: typeof value.id === "string" ? value.id : undefined, kind, label, href, enabled: value.enabled, sortOrder };
}

export function normalizeLinkHref(kind: BusinessProfileLinkKind, value: unknown): string {
  if (kind === "phone") {
    if (typeof value !== "string") throw new BusinessProfileValidationError("business_profile_phone_invalid");
    try { return normalizeBusinessProfileLink(kind, value); } catch { throw new BusinessProfileValidationError("business_profile_phone_invalid"); }
  }
  if (kind === "whatsapp") {
    if (typeof value !== "string") throw new BusinessProfileValidationError("business_profile_phone_invalid");
    try { return normalizeBusinessProfileLink(kind, value); } catch { throw new BusinessProfileValidationError("business_profile_phone_invalid"); }
  }

  const url = parseHttpsUrl(value);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (kind === "instagram" && !(host === "instagram.com" || host.endsWith(".instagram.com"))) throw new BusinessProfileValidationError("business_profile_instagram_invalid");
  if (kind === "tiktok" && !(host === "tiktok.com" || host.endsWith(".tiktok.com"))) throw new BusinessProfileValidationError("business_profile_tiktok_invalid");
  if (kind === "facebook" && !(host === "facebook.com" || host.endsWith(".facebook.com"))) throw new BusinessProfileValidationError("business_profile_facebook_invalid");
  if (kind === "google_review" && !isDirectGoogleReviewUrl(url.toString())) throw new BusinessProfileValidationError("business_profile_google_review_unprepared");
  return url.toString();
}

function parseHttpsUrl(value: unknown): URL {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 2048) throw new BusinessProfileValidationError("business_profile_link_href_invalid");
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new BusinessProfileValidationError("business_profile_link_href_invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || isLocalHost(url.hostname)) throw new BusinessProfileValidationError("business_profile_link_href_invalid");
  return url;
}

function parseText(value: unknown, max: number, code: string) {
  if (typeof value !== "string") throw new BusinessProfileValidationError(code);
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > max) throw new BusinessProfileValidationError(code);
  return normalized;
}

function parseOptionalText(value: unknown, max: number) {
  if (value === undefined || value === null || value === "") return undefined;
  return parseText(value, max, "business_profile_text_invalid");
}

function parseSlug(value: unknown) {
  if (typeof value !== "string") throw new BusinessProfileValidationError("business_profile_slug_invalid");
  const slug = slugifyBusinessProfile(value);
  if (!slug || slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new BusinessProfileValidationError("business_profile_slug_invalid");
  return slug;
}

function parseUuid(value: unknown, code: string) {
  if (typeof value !== "string" || !isUuid(value)) throw new BusinessProfileValidationError(code);
  return value;
}

function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function isLocalHost(host: string) { return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":"); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
