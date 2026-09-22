import {
  DynamicLinkValidationError,
  buildDynamicLinkUrl,
  generateDynamicLinkCode,
  inferDynamicLinkDestinationType,
  isDynamicLinkCode,
  isDirectGoogleReviewUrl,
  normalizeDynamicLinkCode,
  validateDynamicLinkDestination,
} from "@42day/core";
import type { DynamicLinkDestinationType } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings.ts";
import { findDynamicLinkUnitByCode, findTenantStatus, type DynamicLinkUnitRow } from "./repository.ts";

export const DYNAMIC_LINK_BASE_URL_FALLBACK = "https://go.thaledon.com";

export function dynamicLinkBaseUrl(env: ApiBindings) {
  return env.DYNAMIC_LINK_BASE_URL?.trim() || DYNAMIC_LINK_BASE_URL_FALLBACK;
}

export function dashboardBaseUrl(env: ApiBindings) {
  const configured = env.APP_BASE_URL?.trim() || env.DASHBOARD_ALLOWED_ORIGINS?.split(",")[0]?.trim();
  return configured || "https://parahoy.thaledon.com";
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function dynamicLinkUrl(env: ApiBindings, publicCode: string) {
  return buildDynamicLinkUrl(dynamicLinkBaseUrl(env), publicCode);
}

export function createDynamicLinkCode() {
  const values = new Uint8Array(12);
  crypto.getRandomValues(values);
  return generateDynamicLinkCode(values);
}

export function normalizePublicCode(value: string) {
  const code = normalizeDynamicLinkCode(value);
  return isDynamicLinkCode(code) ? code : undefined;
}

export function isDestinationType(value: unknown): value is DynamicLinkDestinationType {
  return value === "google_review" || value === "website" || value === "menu" || value === "whatsapp" || value === "instagram" || value === "profile";
}

export function validateDestination(type: DynamicLinkDestinationType, url: string, env: ApiBindings) {
  return validateDynamicLinkDestination({ type, url, redirectHost: new URL(dynamicLinkBaseUrl(env)).hostname });
}

export function validateAdminDestination(
  type: DynamicLinkDestinationType,
  url: string,
  env: ApiBindings,
  current?: { destinationType?: string | null; destinationUrl?: string | null },
) {
  if (type === "profile") {
    let candidate: URL;
    try { candidate = new URL(url); } catch { throw new DynamicLinkValidationError("dynamic_link_profile_url_invalid"); }
    if (candidate.protocol !== "https:" || !candidate.pathname.startsWith("/p/") || candidate.pathname.length <= 3) {
      throw new DynamicLinkValidationError("dynamic_link_profile_url_invalid");
    }
    return candidate.toString();
  }
  const validated = validateDestination(type, url, env);
  if (type !== "google_review" || isDirectGoogleReviewUrl(validated)) return validated;
  if (
    current?.destinationType === "google_review"
    && current.destinationUrl
    && urlsMatch(validated, current.destinationUrl)
  ) {
    return validated;
  }
  throw new DynamicLinkValidationError("dynamic_link_google_review_resolution_required");
}

export function inferDestinationType(url: string, env: ApiBindings) {
  const publicMenuHost = new URL(dashboardBaseUrl(env)).hostname;
  return inferDynamicLinkDestinationType({ url, publicMenuHost });
}

export type PublicDynamicLinkResolution =
  | { kind: "redirect"; destination: string }
  | { kind: "available" | "suspended" | "archived" | "unknown" | "invalid" };

export async function resolvePublicDynamicLink(env: ApiBindings, rawCode: string): Promise<PublicDynamicLinkResolution> {
  const publicCode = normalizePublicCode(rawCode);
  if (!publicCode) return { kind: "unknown" };
  const unit = await findDynamicLinkUnitByCode(env, publicCode);
  if (!unit) return { kind: "unknown" };
  if (unit.status === "available") return { kind: "available" };
  if (unit.status === "suspended") return { kind: "suspended" };
  if (unit.status === "archived") return { kind: "archived" };
  if (unit.status !== "active" || !unit.destination_type || !unit.destination_url || !isDestinationType(unit.destination_type)) {
    return { kind: "invalid" };
  }
  if (unit.tenant_id) {
    const tenant = await findTenantStatus(env, unit.tenant_id);
    if (!tenant || tenant.status !== "active") return { kind: "suspended" };
  }
  try {
    return { kind: "redirect", destination: validateDestination(unit.destination_type, unit.destination_url, env) };
  } catch (error) {
    if (error instanceof DynamicLinkValidationError) return { kind: "invalid" };
    throw error;
  }
}

export function toDynamicLinkUnit(unit: DynamicLinkUnitRow, env: ApiBindings) {
  return {
    id: unit.id,
    publicCode: unit.public_code,
    publicUrl: dynamicLinkUrl(env, unit.public_code),
    batchId: unit.batch_id ?? undefined,
    label: unit.label,
    tenantId: unit.tenant_id ?? undefined,
    locationId: unit.location_id ?? undefined,
    locationLabelSnapshot: unit.location_label_snapshot ?? undefined,
    destinationType: unit.destination_type ?? undefined,
    destinationUrl: unit.destination_url ?? undefined,
    profileId: unit.profile_id ?? undefined,
    status: unit.status,
    revision: unit.revision,
    nfcUid: unit.nfc_uid ?? undefined,
    qrPrintedAt: unit.qr_printed_at ?? undefined,
    nfcProgrammedAt: unit.nfc_programmed_at ?? undefined,
    nfcVerifiedAt: unit.nfc_verified_at ?? undefined,
    nfcLockedAt: unit.nfc_locked_at ?? undefined,
    activatedAt: unit.activated_at ?? undefined,
    createdAt: unit.created_at,
    updatedAt: unit.updated_at,
  };
}

function urlsMatch(left: string, right: string) {
  try {
    return new URL(left).toString() === new URL(right).toString();
  } catch {
    return left.trim() === right.trim();
  }
}
