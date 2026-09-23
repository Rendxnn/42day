import type {
  BusinessProfileAssociation,
  BusinessProfileListRequest,
  BusinessProfileSortDirection,
  BusinessProfileSortField,
  BusinessProfileStatus,
} from "@42day/types";
import { BusinessProfileValidationError } from "./business-profile-validation.ts";

export type BusinessProfileCursor = {
  version: 1;
  fingerprint: string;
  value: string;
  id: string;
};

const sortFields = new Set<BusinessProfileSortField>(["updatedAt", "createdAt", "displayName", "slug", "status"]);
const statuses = new Set<BusinessProfileStatus>(["draft", "published", "disabled"]);
const associations = new Set<BusinessProfileAssociation>(["linked", "generic"]);

export function parseBusinessProfileListRequest(url: URL): BusinessProfileListRequest {
  const query = normalizeQuery(url.searchParams.get("query"));
  const status = parseEnum(url.searchParams.get("status"), statuses, "business_profile_status_invalid");
  const association = parseEnum(url.searchParams.get("association"), associations, "business_profile_association_invalid");
  const sort = parseEnum(url.searchParams.get("sort"), sortFields, "business_profile_sort_invalid") ?? "updatedAt";
  const direction = parseEnum(url.searchParams.get("direction"), new Set<BusinessProfileSortDirection>(["asc", "desc"]), "business_profile_direction_invalid") ?? "desc";
  const rawPageSize = url.searchParams.get("pageSize");
  const pageSize = rawPageSize === null || rawPageSize === "" ? 25 : Number(rawPageSize);
  if (!Number.isInteger(pageSize) || ![25, 50, 100].includes(pageSize)) {
    throw new BusinessProfileValidationError("business_profile_page_size_invalid");
  }
  const cursor = url.searchParams.get("cursor") ?? undefined;
  return { query, status, association, sort, direction, pageSize: pageSize as 25 | 50 | 100, cursor };
}

export function encodeBusinessProfileCursor(input: Omit<BusinessProfileCursor, "version">): string {
  return encodeBase64Url(JSON.stringify({ version: 1, ...input } satisfies BusinessProfileCursor));
}

export function decodeBusinessProfileCursor(cursor: string | undefined, request: Omit<BusinessProfileListRequest, "cursor">): BusinessProfileCursor | undefined {
  if (!cursor) return undefined;
  try {
    const decoded = JSON.parse(decodeBase64Url(cursor)) as Partial<BusinessProfileCursor>;
    const expected = fingerprint(request);
    if (decoded.version !== 1 || decoded.fingerprint !== expected || typeof decoded.value !== "string" || typeof decoded.id !== "string") {
      throw new Error("invalid");
    }
    return decoded as BusinessProfileCursor;
  } catch {
    throw new BusinessProfileValidationError("invalid_profile_cursor");
  }
}

export function businessProfileCursorFingerprint(request: Omit<BusinessProfileListRequest, "cursor">) {
  return fingerprint(request);
}

function fingerprint(request: Omit<BusinessProfileListRequest, "cursor">) {
  return JSON.stringify({
    query: request.query ?? "",
    status: request.status ?? null,
    association: request.association ?? null,
    sort: request.sort ?? "updatedAt",
    direction: request.direction ?? "desc",
    pageSize: request.pageSize ?? 25,
  });
}

function normalizeQuery(value: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  if (normalized.length > 120) throw new BusinessProfileValidationError("business_profile_query_invalid");
  return normalized || undefined;
}

function parseEnum<T extends string>(value: string | null, allowed: Set<T>, code: string): T | undefined {
  if (value === null || value === "") return undefined;
  if (!allowed.has(value as T)) throw new BusinessProfileValidationError(code);
  return value as T;
}

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}
