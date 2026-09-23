import type { BusinessProfile, BusinessProfileLink, BusinessProfileListRequest, BusinessProfilePage, BusinessProfileResponse, BusinessProfileSummary } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings.ts";
import { createSupabaseRestClient } from "../../lib/supabase-rest.ts";
import { businessProfileCursorFingerprint, decodeBusinessProfileCursor, encodeBusinessProfileCursor } from "./business-profile-pagination.ts";

type ProfileRow = {
  id: string;
  creation_request_id: string;
  slug: string;
  tenant_id?: string | null;
  display_name: string;
  headline?: string | null;
  location_name?: string | null;
  address?: string | null;
  status: "draft" | "published" | "disabled";
  revision: number;
  published_at?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type LinkRow = { id: string; profile_id: string; kind: BusinessProfileLink["kind"]; label?: string | null; href: string; enabled: boolean; sort_order: number };
type BusinessProfileSummaryRpc = BusinessProfileSummary;
type BusinessProfilePageRpc = {
  profiles?: BusinessProfileSummaryRpc[];
  totalCount?: number;
  pageInfo?: { hasNext?: boolean; nextCursor?: { value?: string; id?: string } | null };
};

const profileSelect = "id,creation_request_id,slug,tenant_id,display_name,headline,location_name,address,status,revision,published_at,created_by,created_at,updated_at";
const linkSelect = "id,profile_id,kind,label,href,enabled,sort_order";

export async function createBusinessProfile(env: ApiBindings, input: {
  requestId: string; slug: string; displayName: string; headline?: string; locationName?: string; address?: string; tenantId?: string | null; actorUserId: string;
}) {
  const row = await createSupabaseRestClient(env).rpc<ProfileRow>({ schema: "control", functionName: "create_business_profile", args: {
    p_creation_request_id: input.requestId,
    p_slug: input.slug,
    p_display_name: input.displayName,
    p_headline: input.headline ?? null,
    p_location_name: input.locationName ?? null,
    p_address: input.address ?? null,
    p_tenant_id: input.tenantId ?? null,
    p_actor_user_id: input.actorUserId,
  } });
  return mapProfile(row);
}

export async function findBusinessProfile(env: ApiBindings, id: string, includeActiveQrCount = false) {
  const [row] = await createSupabaseRestClient(env).select<ProfileRow>({ schema: "control", table: "business_profiles", query: { select: profileSelect, id: `eq.${id}`, limit: 1 } });
  if (!row) return undefined;
  return loadProfileResponse(env, row, includeActiveQrCount);
}

export async function findBusinessProfileBySlug(env: ApiBindings, slug: string, publishedOnly = false) {
  const [row] = await createSupabaseRestClient(env).select<ProfileRow>({ schema: "control", table: "business_profiles", query: { select: profileSelect, slug: `eq.${slug}`, ...(publishedOnly ? { status: "eq.published" } : {}), limit: 1 } });
  if (!row) return undefined;
  return loadProfileResponse(env, row);
}

export async function findBusinessProfileByTenant(env: ApiBindings, tenantId: string) {
  const [row] = await createSupabaseRestClient(env).select<ProfileRow>({ schema: "control", table: "business_profiles", query: { select: profileSelect, tenant_id: `eq.${tenantId}`, limit: 1 } });
  if (!row) return undefined;
  return loadProfileResponse(env, row);
}

export async function listBusinessProfiles(env: ApiBindings, request: BusinessProfileListRequest = {}): Promise<BusinessProfilePage> {
  const { cursor, ...cursorRequest } = request;
  const decodedCursor = decodeBusinessProfileCursor(cursor, cursorRequest);
  const raw = await createSupabaseRestClient(env).rpc<BusinessProfilePageRpc>({
    schema: "control",
    functionName: "list_business_profiles_page",
    args: {
      p_query: request.query ?? null,
      p_status: request.status ?? null,
      p_association: request.association ?? null,
      p_sort: request.sort ?? "updatedAt",
      p_direction: request.direction ?? "desc",
      p_page_size: request.pageSize ?? 25,
      p_cursor: decodedCursor ? { value: decodedCursor.value, id: decodedCursor.id } : null,
    },
  });
  const profiles = (raw.profiles ?? []).map((profile) => ({
    ...profile,
    tenantId: profile.tenantId ?? undefined,
    creationRequestId: profile.creationRequestId ?? undefined,
    headline: profile.headline ?? undefined,
    locationName: profile.locationName ?? undefined,
    address: profile.address ?? undefined,
    publishedAt: profile.publishedAt ?? undefined,
  }));
  const hasNext = raw.pageInfo?.hasNext === true;
  const next = raw.pageInfo?.nextCursor;
  const nextCursor = hasNext && next?.value && next.id
    ? encodeBusinessProfileCursor({ fingerprint: businessProfileCursorFingerprint(cursorRequest), value: next.value, id: next.id })
    : undefined;
  return { profiles, totalCount: Number(raw.totalCount ?? 0), pageInfo: { hasNext, ...(nextCursor ? { nextCursor } : {}) } };
}

export async function updateBusinessProfile(env: ApiBindings, input: {
  profileId: string; expectedRevision: number; actorUserId: string; displayName: string; headline?: string; locationName?: string; address?: string; links: BusinessProfileLink[];
}) {
  const row = await createSupabaseRestClient(env).rpc<ProfileRow>({ schema: "control", functionName: "update_business_profile", args: {
    p_profile_id: input.profileId,
    p_expected_revision: input.expectedRevision,
    p_actor_user_id: input.actorUserId,
    p_display_name: input.displayName,
    p_headline: input.headline ?? null,
    p_location_name: input.locationName ?? null,
    p_address: input.address ?? null,
    p_links: input.links.map(({ kind, label, href, enabled, sortOrder }) => ({ kind, label: label ?? null, href, enabled, sort_order: sortOrder })),
  } });
  return loadProfileResponse(env, row);
}

export async function publishBusinessProfile(env: ApiBindings, profileId: string, expectedRevision: number, actorUserId: string) {
  const row = await createSupabaseRestClient(env).rpc<ProfileRow>({ schema: "control", functionName: "publish_business_profile", args: { p_profile_id: profileId, p_expected_revision: expectedRevision, p_actor_user_id: actorUserId } });
  return loadProfileResponse(env, row);
}

export async function disableBusinessProfileAndSuspend(env: ApiBindings, profileId: string, expectedRevision: number, actorUserId: string) {
  const result = await createSupabaseRestClient(env).rpc<{ profile: ProfileRow; suspendedUnitCount: number }>({ schema: "control", functionName: "disable_business_profile_and_suspend", args: { p_profile_id: profileId, p_expected_revision: expectedRevision, p_actor_user_id: actorUserId } });
  return { ...result, profile: await loadProfileResponse(env, result.profile) };
}

async function loadProfileResponse(env: ApiBindings, row: ProfileRow, includeActiveQrCount = false): Promise<BusinessProfileResponse> {
  const links = await createSupabaseRestClient(env).select<LinkRow>({ schema: "control", table: "business_profile_links", query: { select: linkSelect, profile_id: `eq.${row.id}`, order: "sort_order.asc" } });
  const activeQrCount = includeActiveQrCount
    ? await createSupabaseRestClient(env).rpc<number>({ schema: "control", functionName: "count_active_business_profile_qrs", args: { p_profile_id: row.id } })
    : undefined;
  return { profile: mapProfile(row), links: links.map(mapLink), ...(activeQrCount === undefined ? {} : { activeQrCount, usage: { activeQrCount } }) };
}

export function mapProfile(row: ProfileRow): BusinessProfile {
  return { id: row.id, creationRequestId: row.creation_request_id, slug: row.slug, tenantId: row.tenant_id ?? undefined, displayName: row.display_name, headline: row.headline ?? undefined, locationName: row.location_name ?? undefined, address: row.address ?? undefined, status: row.status, revision: row.revision, publishedAt: row.published_at ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapLink(row: LinkRow): BusinessProfileLink { return { id: row.id, kind: row.kind, label: row.label ?? undefined, href: row.href, enabled: row.enabled, sortOrder: row.sort_order }; }
