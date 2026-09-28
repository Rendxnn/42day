import { Hono } from "hono";
import type { Context } from "hono";
import { businessProfileErrorMessage } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings.ts";
import { SupabaseRestError } from "../../lib/supabase-rest.ts";
import { getTenantUserRole, isSystemAdmin, requireAuthUser, requireSystemAdmin } from "../dashboard/auth.ts";
import type { DashboardContext, DashboardVariables } from "../dashboard/types.ts";
import {
  createBusinessProfile,
  disableBusinessProfileAndSuspend,
  findBusinessProfile,
  findBusinessProfileBySlug,
  findBusinessProfileAsset,
  listBusinessProfiles,
  publishBusinessProfile,
  updateBusinessProfile,
} from "./business-profile-repository.ts";
import { validateBusinessProfileImage } from "./business-profile-image.ts";
import { createSupabaseRestClient } from "../../lib/supabase-rest.ts";
import { BusinessProfileValidationError, parseCreateBusinessProfile, parseUpdateBusinessProfile } from "./business-profile-validation.ts";
import { parseBusinessProfileListRequest } from "./business-profile-pagination.ts";

export const businessProfileRoutes = new Hono<{ Bindings: ApiBindings; Variables: DashboardVariables }>();

businessProfileRoutes.get("/public/p/:slug", (c) => publicProfile(c));
businessProfileRoutes.get("/public/business-profiles/:slug", (c) => publicProfile(c));
businessProfileRoutes.get("/public/business-profile-assets/:assetId", (c) => serveProfileAsset(c, c.req.param("assetId"), false));
businessProfileRoutes.get("/business-profile-assets/:assetId/preview", (c) => previewProfileAsset(c));

businessProfileRoutes.post("/admin/business-profiles/:id/avatar", async (c) => {
  const actor = await requireAuthUser(c as DashboardContext);
  if (actor instanceof Response) return actor;
  const contentLengthHeader = c.req.header("Content-Length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : Number.NaN;
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) return profileError(c, "business_profile_avatar_size_invalid", 413);
  if (contentLength > 3_250_000) return profileError(c, "business_profile_avatar_size_invalid", 413);
  try {
    const profile = await findBusinessProfile(c.env, c.req.param("id"));
    if (!profile) return profileError(c, "business_profile_not_found", 404);
    if (profile.profile.status === "disabled") return profileError(c, "business_profile_disabled", 409);
    const role = profile.profile.tenantId ? await getTenantUserRole(c.env, actor.id, profile.profile.tenantId) : undefined;
    if (!isSystemAdmin(actor) && !["owner", "manager", "encargado"].includes(role ?? "")) return c.json({ error: "admin_forbidden" }, 403);
    const slot = await createSupabaseRestClient(c.env).rpc<boolean>({ schema: "control", functionName: "reserve_business_profile_asset_upload", args: { p_actor_user_id: actor.id } });
    if (!slot) { c.header("Retry-After", "3600"); return profileError(c, "business_profile_avatar_rate_limited", 429); }
    const rawBody = await readBoundedBody(c.req.raw, 3_250_000);
    if (!rawBody) return profileError(c, "business_profile_avatar_size_invalid", 413);
    const formRequestHeaders = new Headers(c.req.raw.headers);
    formRequestHeaders.delete("Content-Length");
    const form = await new Request(c.req.url, { method: "POST", headers: formRequestHeaders, body: rawBody }).formData();
    const file: unknown = form.get("file");
    if (!isUploadFile(file)) return profileError(c, "business_profile_avatar_required", 400);
    if (file.size > 3 * 1024 * 1024) return profileError(c, "business_profile_avatar_size_invalid", 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validated = validateBusinessProfileImage(bytes);
    const assetId = crypto.randomUUID();
    const sha256 = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
    const path = `${profile.profile.id}/${assetId}.${validated.extension}`;
    const storage = createSupabaseRestClient(c.env);
    await storage.uploadObject({ bucket: "business-profile-assets", path, body: new Blob([bytes], { type: validated.contentType }), contentType: validated.contentType });
    try {
      await storage.insert({ schema: "control", table: "business_profile_assets", rows: { id: assetId, profile_id: profile.profile.id, actor_user_id: actor.id, object_path: path, content_type: validated.contentType, byte_size: bytes.byteLength, sha256, state: "staged", expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() } });
    } catch (error) {
      await storage.deleteObject({ bucket: "business-profile-assets", path }).catch(() => undefined);
      throw error;
    }
    return c.json({ assetId, previewUrl: new URL(`/dashboard/business-profile-assets/${assetId}/preview`, c.req.url).toString(), width: validated.width, height: validated.height, contentType: validated.contentType }, 201);
  } catch (error) { return businessProfileError(c, error); }
});

businessProfileRoutes.get("/admin/business-profile-assets/:assetId/preview", async (c) => previewProfileAsset(c));

async function previewProfileAsset(c: Context<{ Bindings: ApiBindings; Variables: DashboardVariables }>) {
  const actor = await requireAuthUser(c as DashboardContext);
  if (actor instanceof Response) return actor;
  const assetId = c.req.param("assetId") ?? "";
  const asset = await findBusinessProfileAsset(c.env, assetId);
  if (!asset) return profileError(c, "business_profile_asset_invalid", 404);
  const profile = await findBusinessProfile(c.env, asset.profile_id);
  const ownsAsset = asset.actor_user_id === actor.id;
  const managerRole = profile?.profile.tenantId ? await getTenantUserRole(c.env, actor.id, profile.profile.tenantId) : undefined;
  if (!isSystemAdmin(actor) && !ownsAsset && !["owner", "manager", "encargado"].includes(managerRole ?? "")) return c.json({ error: "admin_forbidden" }, 403);
  return serveProfileAsset(c, assetId, true);
}

businessProfileRoutes.post("/admin/business-profiles", async (c) => {
  const actor = await requireSystemAdmin(c as DashboardContext);
  if (actor instanceof Response) return actor;
  try {
    const input = parseCreateBusinessProfile(await c.req.json().catch(() => undefined));
    const result = await createBusinessProfile(c.env, { ...input, actorUserId: actor.id, slug: input.slug! });
    return c.json({ profile: result }, 201);
  } catch (error) {
    return businessProfileError(c, error);
  }
});

businessProfileRoutes.get("/admin/business-profiles", async (c) => {
  const actor = await requireSystemAdmin(c as DashboardContext);
  if (actor instanceof Response) return actor;
  try {
    const request = parseBusinessProfileListRequest(new URL(c.req.url));
    return c.json(await listBusinessProfiles(c.env, request));
  } catch (error) {
    return businessProfileError(c, error);
  }
});

businessProfileRoutes.get("/admin/business-profiles/:id", async (c) => {
  const actor = await requireSystemAdmin(c as DashboardContext);
  if (actor instanceof Response) return actor;
  try {
    const result = await findBusinessProfile(c.env, c.req.param("id"), true);
    return result ? c.json(result) : c.json({ error: "business_profile_not_found", message: businessProfileErrorMessage("business_profile_not_found") }, 404);
  } catch (error) {
    return businessProfileError(c, error);
  }
});

businessProfileRoutes.patch("/admin/business-profiles/:id", async (c) => {
  const actor = await requireSystemAdmin(c as DashboardContext);
  if (actor instanceof Response) return actor;
  try {
    const input = parseUpdateBusinessProfile(await c.req.json().catch(() => undefined));
    const result = await updateBusinessProfile(c.env, { ...input, profileId: c.req.param("id"), expectedRevision: input.revision, actorUserId: actor.id });
    return c.json(result);
  } catch (error) {
    return businessProfileError(c, error);
  }
});

businessProfileRoutes.post("/admin/business-profiles/:id/publish", async (c) => {
  const actor = await requireSystemAdmin(c as DashboardContext);
  if (actor instanceof Response) return actor;
  try {
    const body = await c.req.json().catch(() => undefined) as { revision?: unknown } | undefined;
    if (!Number.isInteger(body?.revision) || Number(body?.revision) < 1) return c.json({ error: "business_profile_revision_invalid", message: businessProfileErrorMessage("business_profile_revision_invalid"), field: "revision" }, 400);
    const result = await publishBusinessProfile(c.env, c.req.param("id"), Number(body?.revision), actor.id);
    return c.json(result);
  } catch (error) {
    return businessProfileError(c, error);
  }
});

businessProfileRoutes.post("/admin/business-profiles/:id/disable-and-suspend", async (c) => {
  const actor = await requireSystemAdmin(c as DashboardContext);
  if (actor instanceof Response) return actor;
  try {
    const body = await c.req.json().catch(() => undefined) as { revision?: unknown } | undefined;
    if (!Number.isInteger(body?.revision) || Number(body?.revision) < 1) return c.json({ error: "business_profile_revision_invalid", message: businessProfileErrorMessage("business_profile_revision_invalid"), field: "revision" }, 400);
    const result = await disableBusinessProfileAndSuspend(c.env, c.req.param("id"), Number(body?.revision), actor.id);
    return c.json(result);
  } catch (error) {
    return businessProfileError(c, error);
  }
});

async function publicProfile(c: Context<{ Bindings: ApiBindings; Variables: DashboardVariables }>) {
  try {
    const slug = c.req.param("slug");
    if (!slug) return c.json({ error: "business_profile_not_found", message: businessProfileErrorMessage("business_profile_not_found") }, 404);
    const result = await findBusinessProfileBySlug(c.env, slug, true);
    if (!result) return c.json({ error: "business_profile_not_found", message: businessProfileErrorMessage("business_profile_not_found") }, 404);
    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json({
      profile: {
        slug: result.profile.slug,
        displayName: result.profile.displayName,
        headline: result.profile.headline,
        locationName: result.profile.locationName,
        address: result.profile.address,
        appearance: result.profile.appearance,
        ...(result.profile.avatar ? { avatar: { ...result.profile.avatar, url: new URL(`/dashboard/public/business-profile-assets/${encodeURIComponent(result.profile.avatar.assetId)}`, c.req.url).toString() } } : {}),
      },
      links: result.links
        .filter((link) => link.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(({ kind, label, href, sortOrder }) => ({ kind, label, href, sortOrder })),
    });
  } catch (error) {
    return businessProfileError(c, error);
  }
}

async function serveProfileAsset(c: Context<{ Bindings: ApiBindings; Variables: DashboardVariables }>, assetId: string, preview: boolean) {
  try {
    const asset = await findBusinessProfileAsset(c.env, assetId);
    if (!asset || (asset.state !== "active" && !preview)) return profileError(c, "business_profile_asset_invalid", 404);
    if (!preview) {
      const [published] = await createSupabaseRestClient(c.env).select<{ id: string }>({ schema: "control", table: "business_profiles", query: { select: "id", avatar_asset_id: `eq.${assetId}`, status: "eq.published", limit: 1 } });
      if (!published) return profileError(c, "business_profile_asset_invalid", 404);
    }
    const etag = `"${asset.sha256}"`;
    if (!preview && c.req.header("If-None-Match")?.split(",").map((value) => value.trim()).includes(etag)) {
      return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } });
    }
    const encodedPath = asset.object_path.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`${c.env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/business-profile-assets/${encodedPath}`, { headers: { apikey: c.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}` } });
    if (!response.ok) return profileError(c, "business_profile_asset_invalid", 404);
    const headers = new Headers({ "Content-Type": asset.content_type, "Cache-Control": preview ? "private, no-store" : "public, max-age=3600, stale-while-revalidate=86400", ETag: etag, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" });
    return new Response(response.body, { status: 200, headers });
  } catch (error) { return businessProfileError(c, error); }
}

function profileError(c: Context, code: string, status: number) {
  return c.json({ error: code, message: businessProfileErrorMessage(code) }, status as 400 | 404 | 409 | 413);
}
function hex(bytes: Uint8Array) { return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(""); }
function isUploadFile(value: unknown): value is { size: number; arrayBuffer(): Promise<ArrayBuffer> } {
  return typeof value === "object" && value !== null && typeof (value as { size?: unknown }).size === "number" && typeof (value as { arrayBuffer?: unknown }).arrayBuffer === "function";
}

async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array | undefined> {
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); return undefined; }
      chunks.push(value);
    }
  } catch { return undefined; }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

function businessProfileError(c: Context, error: unknown) {
  if (error instanceof BusinessProfileValidationError) {
    return c.json({ error: error.code, message: error.message, ...(error.field ? { field: error.field } : {}) }, 400);
  }
  if (error instanceof SupabaseRestError) {
    const code = extractDatabaseCode(error.body) ?? "business_profile_database_error";
    const status = code.includes("not_found") ? 404 : code.includes("stale") || code.includes("conflict") || code.includes("disabled") || code.includes("not_draft") ? 409 : 400;
    return c.json({ error: code, message: businessProfileErrorMessage(code) }, status);
  }
  return c.json({ error: "business_profile_operation_failed", message: businessProfileErrorMessage("business_profile_operation_failed") }, 500);
}

function extractDatabaseCode(body: string) {
  try {
    const parsed = JSON.parse(body) as { message?: string; hint?: string; details?: string };
    const value = `${parsed.message ?? ""} ${parsed.hint ?? ""} ${parsed.details ?? ""}`;
    return value.match(/business_profile_[a-z0-9_]+/)?.[0];
  } catch {
    return undefined;
  }
}
