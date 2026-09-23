import { isDirectGoogleReviewUrl, normalizeBusinessProfileLink, slugifyBusinessProfile as coreSlugifyBusinessProfile } from "@42day/core";
import { BUSINESS_PROFILE_ERROR_MESSAGES, BUSINESS_PROFILE_LIMITS } from "@42day/types";
import type { BusinessProfileLink, BusinessProfileLinkKind, CreateBusinessProfileRequest, UpdateBusinessProfileRequest } from "@42day/types";

const LINK_KINDS = new Set<BusinessProfileLinkKind>([
  "menu", "google_review", "instagram", "tiktok", "website", "whatsapp", "phone", "facebook", "maps", "survey", "custom",
]);

export class BusinessProfileValidationError extends Error {
  readonly code: string;
  readonly field?: string;
  constructor(code: string, field?: string) {
    super(BUSINESS_PROFILE_ERROR_MESSAGES[code] ?? BUSINESS_PROFILE_ERROR_MESSAGES.business_profile_invalid);
    this.name = "BusinessProfileValidationError";
    this.code = code;
    this.field = field;
  }
}

export function slugifyBusinessProfile(value: string) {
  return coreSlugifyBusinessProfile(value);
}

export function parseCreateBusinessProfile(value: unknown): CreateBusinessProfileRequest {
  if (!isRecord(value) || typeof value.requestId !== "string" || !isUuid(value.requestId)) throw new BusinessProfileValidationError("business_profile_request_invalid");
  const displayName = parseText(value.displayName, BUSINESS_PROFILE_LIMITS.displayName, "business_profile_display_name_invalid", "displayName");
  const slug = value.slug === undefined ? slugifyBusinessProfile(displayName) : parseSlug(value.slug);
  if (!slug) throw new BusinessProfileValidationError("business_profile_slug_invalid");
  return {
    requestId: value.requestId,
    slug,
    displayName,
    headline: parseOptionalText(value.headline, BUSINESS_PROFILE_LIMITS.headline, "headline"),
    locationName: parseOptionalText(value.locationName, BUSINESS_PROFILE_LIMITS.locationName, "locationName"),
    address: parseOptionalText(value.address, BUSINESS_PROFILE_LIMITS.address, "address"),
    tenantId: value.tenantId === null ? null : value.tenantId === undefined ? undefined : parseUuid(value.tenantId, "business_profile_tenant_invalid", "tenantId"),
  };
}

export function parseUpdateBusinessProfile(value: unknown): UpdateBusinessProfileRequest {
  if (!isRecord(value) || !Number.isInteger(value.revision) || Number(value.revision) < 1) throw new BusinessProfileValidationError("business_profile_revision_invalid");
  const linksValue = value.links;
  if (!Array.isArray(linksValue) || linksValue.length > 30) throw new BusinessProfileValidationError("business_profile_links_invalid");
  return {
    revision: Number(value.revision),
    displayName: parseText(value.displayName, BUSINESS_PROFILE_LIMITS.displayName, "business_profile_display_name_invalid", "displayName"),
    headline: parseOptionalText(value.headline, BUSINESS_PROFILE_LIMITS.headline, "headline"),
    locationName: parseOptionalText(value.locationName, BUSINESS_PROFILE_LIMITS.locationName, "locationName"),
    address: parseOptionalText(value.address, BUSINESS_PROFILE_LIMITS.address, "address"),
    links: linksValue
      .map((link, index) => normalizeLink(link, index))
      .filter((link) => link.enabled || link.href.length > 0),
  };
}

export function normalizeLink(value: unknown, index = 0): BusinessProfileLink {
  if (!isRecord(value) || typeof value.kind !== "string" || !LINK_KINDS.has(value.kind as BusinessProfileLinkKind)) throw new BusinessProfileValidationError("business_profile_link_kind_invalid", `links[${index}].kind`);
  const kind = value.kind as BusinessProfileLinkKind;
  const label = value.label === undefined || value.label === null ? undefined : parseText(value.label, BUSINESS_PROFILE_LIMITS.linkLabel, "business_profile_link_label_invalid", `links[${index}].label`);
  if (typeof value.enabled !== "boolean") throw new BusinessProfileValidationError("business_profile_link_enabled_invalid", `links[${index}].enabled`);
  const sortOrder = value.sortOrder === undefined ? index * 10 + 10 : Number(value.sortOrder);
  if (!Number.isInteger(sortOrder) || sortOrder < 0) throw new BusinessProfileValidationError("business_profile_link_order_invalid", `links[${index}].sortOrder`);
  const rawHref = typeof value.href === "string" ? value.href.trim() : "";
  if (!value.enabled && !rawHref) return { id: typeof value.id === "string" ? value.id : undefined, kind, label, href: "", enabled: false, sortOrder };
  const href = !value.enabled ? rawHref : normalizeLinkHref(kind, value.href, `links[${index}].href`);
  return { id: typeof value.id === "string" ? value.id : undefined, kind, label, href, enabled: value.enabled, sortOrder };
}

export function normalizeLinkHref(kind: BusinessProfileLinkKind, value: unknown, field?: string): string {
  if (kind === "phone") {
    if (typeof value !== "string") throw new BusinessProfileValidationError("business_profile_phone_invalid", field);
    try { return normalizeBusinessProfileLink(kind, value); } catch { throw new BusinessProfileValidationError("business_profile_phone_invalid", field); }
  }
  if (kind === "whatsapp") {
    if (typeof value !== "string") throw new BusinessProfileValidationError("business_profile_phone_invalid", field);
    try { return normalizeBusinessProfileLink(kind, value); } catch { throw new BusinessProfileValidationError("business_profile_phone_invalid", field); }
  }

  const url = parseHttpsUrl(value, field);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (kind === "instagram" && !(host === "instagram.com" || host.endsWith(".instagram.com"))) throw new BusinessProfileValidationError("business_profile_instagram_invalid", field);
  if (kind === "tiktok" && !(host === "tiktok.com" || host.endsWith(".tiktok.com"))) throw new BusinessProfileValidationError("business_profile_tiktok_invalid", field);
  if (kind === "facebook" && !(host === "facebook.com" || host.endsWith(".facebook.com"))) throw new BusinessProfileValidationError("business_profile_facebook_invalid", field);
  if (kind === "google_review" && !isDirectGoogleReviewUrl(url.toString())) throw new BusinessProfileValidationError("business_profile_google_review_unprepared", field);
  return url.toString();
}

function parseHttpsUrl(value: unknown, field?: string): URL {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > BUSINESS_PROFILE_LIMITS.linkHref) throw new BusinessProfileValidationError("business_profile_link_href_invalid", field);
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new BusinessProfileValidationError("business_profile_link_href_invalid", field); }
  if (url.protocol !== "https:" || url.username || url.password || isLocalHost(url.hostname)) throw new BusinessProfileValidationError("business_profile_link_href_invalid", field);
  return url;
}

function parseText(value: unknown, max: number, code: string, field?: string) {
  if (typeof value !== "string") throw new BusinessProfileValidationError(code, field);
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > max) throw new BusinessProfileValidationError(code, field);
  return normalized;
}

function parseOptionalText(value: unknown, max: number, field?: string) {
  if (value === undefined || value === null || value === "") return undefined;
  return parseText(value, max, "business_profile_text_invalid", field);
}

function parseSlug(value: unknown) {
  if (typeof value !== "string") throw new BusinessProfileValidationError("business_profile_slug_invalid");
  const slug = slugifyBusinessProfile(value);
  if (!slug || slug.length > BUSINESS_PROFILE_LIMITS.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new BusinessProfileValidationError("business_profile_slug_invalid", "slug");
  return slug;
}

function parseUuid(value: unknown, code: string, field?: string) {
  if (typeof value !== "string" || !isUuid(value)) throw new BusinessProfileValidationError(code, field);
  return value;
}

function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function isLocalHost(host: string) { return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":"); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
