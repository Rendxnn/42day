import { BUSINESS_PROFILE_LIMITS } from "@42day/types";
import type { BusinessProfileLink, BusinessProfileListRequest } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings.ts";
import { createSupabaseRestClient, SupabaseRestError } from "../../lib/supabase-rest.ts";
import { findBusinessProfile, listBusinessProfiles } from "../public-profile/business-profile-repository.ts";
import { normalizeLink, slugifyBusinessProfile, BusinessProfileValidationError } from "../public-profile/business-profile-validation.ts";
import { resolveGoogleReviewDestination } from "../dynamic-links/google-review-resolver.ts";
import { dynamicLinkBaseUrl, dynamicLinkUrl, sha256Hex, randomToken, dashboardBaseUrl, normalizePublicCode, toDynamicLinkUnit } from "../dynamic-links/service.ts";
import { findDynamicLinkUnitByCode } from "../dynamic-links/repository.ts";
import type { AgentContext } from "./auth.ts";

export class BusinessSetupAgentError extends Error {
  readonly code: string;
  readonly status: 400 | 404 | 409;
  constructor(code: string, status: 400 | 404 | 409 = 400) { super(code); this.code = code; this.status = status; }
}

export type BusinessSetupLinkInput = { kind: BusinessProfileLink["kind"]; label?: string; href: string; enabled?: boolean };
export type BusinessSetupInput = {
  business: { displayName: string; locationName?: string; address?: string; headline?: string; tenantId?: string | null; links: BusinessSetupLinkInput[] };
  qrCode: string;
};

export async function listAgentProfiles(env: ApiBindings, request: BusinessProfileListRequest) {
  return listBusinessProfiles(env, request);
}

export async function getAgentProfile(env: ApiBindings, profileId: string) {
  const result = await findBusinessProfile(env, profileId, true);
  if (!result) throw new BusinessSetupAgentError("business_profile_not_found", 404);
  return result;
}

export async function prepareBusinessSetup(env: ApiBindings, actor: AgentContext, input: BusinessSetupInput) {
  const code = normalizePublicCode(input.qrCode);
  if (!code) throw new BusinessSetupAgentError("dynamic_link_code_invalid");
  const unit = await findDynamicLinkUnitByCode(env, code);
  if (!unit) throw new BusinessSetupAgentError("dynamic_link_not_found", 404);
  if (unit.status === "archived") throw new BusinessSetupAgentError("dynamic_link_archived", 409);
  const displayName = normalizeText(input.business.displayName, BUSINESS_PROFILE_LIMITS.displayName, "business_profile_display_name_invalid");
  const requestId = crypto.randomUUID();
  const warnings: string[] = [];
  const links: BusinessProfileLink[] = [];
  for (const [index, candidate] of (input.business.links ?? []).entries()) {
    try {
      let href = candidate.href;
      if (candidate.kind === "google_review") {
        try {
          const resolution = await resolveGoogleReviewDestination(candidate.href);
          href = resolution.resolution.reviewUrl;
          warnings.push(`Confirma visualmente la reseña de Google propuesta para ${displayName}.`);
        } catch {
          warnings.push(`No se pudo preparar el enlace de Google Reviews; se omitió hasta confirmarlo.`);
          continue;
        }
      }
      links.push(normalizeLink({ kind: candidate.kind, label: candidate.label, href, enabled: candidate.enabled !== false, sortOrder: (index + 1) * 10 }));
    } catch (error) {
      if (error instanceof BusinessProfileValidationError) warnings.push(`Se omitió ${candidate.kind}: ${error.code}.`);
      else throw error;
    }
  }
  const normalizedBusiness = {
    requestId,
    displayName,
    slug: slugifyBusinessProfile(displayName),
    headline: normalizeOptionalText(input.business.headline, BUSINESS_PROFILE_LIMITS.headline),
    locationName: normalizeOptionalText(input.business.locationName, BUSINESS_PROFILE_LIMITS.locationName),
    address: normalizeOptionalText(input.business.address, BUSINESS_PROFILE_LIMITS.address),
    tenantId: input.business.tenantId ?? null,
    links,
  };
  const matches = await listBusinessProfiles(env, { query: displayName, pageSize: 25, sort: "displayName", direction: "asc" });
  const usedSlugs = new Set(matches.profiles.map((profile) => profile.slug));
  const slugBase = normalizedBusiness.slug;
  let slug = slugBase;
  let suffix = 2;
  while (usedSlugs.has(slug)) slug = `${slugBase}-${suffix++}`;
  normalizedBusiness.slug = slug;
  const matchingProfiles = matches.profiles.filter((profile) => profile.displayName.toLowerCase().includes(displayName.toLowerCase()) || profile.slug === normalizedBusiness.slug).slice(0, 5).map((profile) => ({ id: profile.id, displayName: profile.displayName, slug: profile.slug, revision: profile.revision, status: profile.status }));
  if (matchingProfiles.length > 0) warnings.push("Hay perfiles similares; elige explícitamente si reutilizas uno o creas otro.");
  const proposal = {
    business: normalizedBusiness,
    qr: { id: unit.id, code: unit.public_code, revision: unit.revision, status: unit.status, publicUrl: dynamicLinkUrl(env, unit.public_code) },
    matchingProfiles,
  };
  const preparationToken = randomToken();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const stored = await createSupabaseRestClient(env).insertReturning<{ id: string }>({ schema: "control", table: "business_setup_operations", rows: {
    preparation_token_hash: await sha256Hex(preparationToken),
    actor_user_id: actor.userId,
    oauth_client_id: actor.clientId,
    proposal,
    qr_unit_id: unit.id,
    expected_qr_revision: unit.revision,
    matching_profile_id: matchingProfiles[0]?.id ?? null,
    expected_profile_revision: matchingProfiles[0]?.revision ?? null,
    expires_at: expiresAt,
  } });
  const preparationId = stored[0]?.id;
  if (!preparationId) throw new Error("business_setup_preparation_empty");
  return {
    preparationId,
    preparationToken,
    expiresAt,
    normalizedProposal: proposal.business,
    qr: proposal.qr,
    matchingProfiles,
    warnings,
    changes: [{ field: "profile", current: null, proposed: proposal.business }, { field: "qr.destination", current: unit.destination_url ?? null, proposed: `${dashboardBaseUrl(env)}/p/${normalizedBusiness.slug}` }],
    requiresActiveQrConsent: unit.status === "active",
  };
}

export async function commitBusinessSetup(env: ApiBindings, actor: AgentContext, input: { preparationId: string; preparationToken: string; operationId: string; confirmed: boolean; activeQrConsent?: boolean; duplicateDecision: "create_new" | { reuseProfileId: string } }) {
  if (!input.confirmed) throw new BusinessSetupAgentError("business_setup_confirmation_required");
  const duplicateProfileId = input.duplicateDecision === "create_new" ? null : input.duplicateDecision.reuseProfileId;
  const commandHash = await sha256Hex(JSON.stringify({ preparationId: input.preparationId, duplicateProfileId, activeQrConsent: input.activeQrConsent === true }));
  try {
    return await createSupabaseRestClient(env).rpc<Record<string, unknown>>({ schema: "control", functionName: "commit_business_setup", args: {
      p_preparation_id: input.preparationId,
      p_preparation_token_hash: await sha256Hex(input.preparationToken),
      p_operation_id: input.operationId,
      p_actor_user_id: actor.userId,
      p_oauth_client_id: actor.clientId,
      p_command_hash: commandHash,
      p_confirmed: true,
      p_active_qr_consent: input.activeQrConsent === true,
      p_duplicate_profile_id: duplicateProfileId,
      p_public_base_url: dashboardBaseUrl(env),
      p_dynamic_link_base_url: dynamicLinkBaseUrl(env),
    } });
  } catch (error) {
    const code = error instanceof SupabaseRestError ? extractDatabaseCode(error.body) : error instanceof Error ? error.message : undefined;
    if (code && /^(business_setup_|dynamic_link_|business_profile_)/.test(code)) {
      const status = code.includes("not_found") ? 404 : code.includes("stale") || code.includes("reuse") || code.includes("active_consent") || code.includes("used") ? 409 : 400;
      throw new BusinessSetupAgentError(code, status);
    }
    throw error;
  }
}

function extractDatabaseCode(body: string) {
  try {
    const parsed = JSON.parse(body) as { message?: string; hint?: string; details?: string };
    return `${parsed.message ?? ""} ${parsed.hint ?? ""} ${parsed.details ?? ""}`.match(/(?:business_setup|dynamic_link|business_profile)_[a-z0-9_]+/)?.[0];
  } catch {
    return undefined;
  }
}

function normalizeText(value: unknown, max: number, code: string) { if (typeof value !== "string") throw new BusinessSetupAgentError(code); const normalized = value.trim().replace(/\s+/g, " "); if (!normalized || normalized.length > max) throw new BusinessSetupAgentError(code); return normalized; }
function normalizeOptionalText(value: unknown, max: number) { if (value === undefined || value === null || value === "") return undefined; return normalizeText(value, max, "business_profile_text_invalid"); }
