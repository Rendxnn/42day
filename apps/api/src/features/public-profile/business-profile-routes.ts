import { Hono } from "hono";
import type { Context } from "hono";
import type { ApiBindings } from "../../lib/bindings.ts";
import { SupabaseRestError } from "../../lib/supabase-rest.ts";
import { requireSystemAdmin } from "../dashboard/auth.ts";
import type { DashboardContext, DashboardVariables } from "../dashboard/types.ts";
import {
  createBusinessProfile,
  disableBusinessProfileAndSuspend,
  findBusinessProfile,
  findBusinessProfileBySlug,
  listBusinessProfiles,
  publishBusinessProfile,
  updateBusinessProfile,
} from "./business-profile-repository.ts";
import { BusinessProfileValidationError, parseCreateBusinessProfile, parseUpdateBusinessProfile } from "./business-profile-validation.ts";

export const businessProfileRoutes = new Hono<{ Bindings: ApiBindings; Variables: DashboardVariables }>();

businessProfileRoutes.get("/public/p/:slug", (c) => publicProfile(c));
businessProfileRoutes.get("/public/business-profiles/:slug", (c) => publicProfile(c));

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
  return c.json({ profiles: await listBusinessProfiles(c.env) });
});

businessProfileRoutes.get("/admin/business-profiles/:id", async (c) => {
  const actor = await requireSystemAdmin(c as DashboardContext);
  if (actor instanceof Response) return actor;
  try {
    const result = await findBusinessProfile(c.env, c.req.param("id"), true);
    return result ? c.json(result) : c.json({ error: "business_profile_not_found" }, 404);
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
    if (!Number.isInteger(body?.revision) || Number(body?.revision) < 1) return c.json({ error: "business_profile_revision_invalid" }, 400);
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
    if (!Number.isInteger(body?.revision) || Number(body?.revision) < 1) return c.json({ error: "business_profile_revision_invalid" }, 400);
    const result = await disableBusinessProfileAndSuspend(c.env, c.req.param("id"), Number(body?.revision), actor.id);
    return c.json(result);
  } catch (error) {
    return businessProfileError(c, error);
  }
});

async function publicProfile(c: Context<{ Bindings: ApiBindings; Variables: DashboardVariables }>) {
  try {
    const slug = c.req.param("slug");
    if (!slug) return c.json({ error: "business_profile_not_found" }, 404);
    const result = await findBusinessProfileBySlug(c.env, slug, true);
    if (!result) return c.json({ error: "business_profile_not_found" }, 404);
    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json({
      profile: {
        slug: result.profile.slug,
        displayName: result.profile.displayName,
        headline: result.profile.headline,
        locationName: result.profile.locationName,
        address: result.profile.address,
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

function businessProfileError(c: Context, error: unknown) {
  if (error instanceof BusinessProfileValidationError) return c.json({ error: error.code }, 400);
  if (error instanceof SupabaseRestError) {
    const code = extractDatabaseCode(error.body) ?? "business_profile_database_error";
    const status = code.includes("not_found") ? 404 : code.includes("stale") || code.includes("conflict") || code.includes("disabled") || code.includes("not_draft") ? 409 : 400;
    return c.json({ error: code }, status);
  }
  throw error;
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
