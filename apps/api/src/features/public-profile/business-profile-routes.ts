import { Hono } from "hono";
import type { ApiBindings } from "../../lib/bindings";
import { createSupabaseRestClient } from "../../lib/supabase-rest";
import { requireSystemAdmin } from "../dashboard/auth";
import type { DashboardContext, DashboardVariables } from "../dashboard/types";

type ProfileRow = { id: string; slug: string; tenant_id?: string | null; display_name: string; headline?: string | null; location_name?: string | null; address?: string | null; status: "draft" | "published" | "disabled"; revision: number; published_at?: string | null; created_at: string; updated_at: string };
type LinkRow = { id: string; profile_id: string; kind: string; label?: string | null; href: string; enabled: boolean; sort_order: number };

export const businessProfileRoutes = new Hono<{ Bindings: ApiBindings; Variables: DashboardVariables }>();

businessProfileRoutes.get("/public/business-profiles/:slug", async (c) => {
  const [profile] = await createSupabaseRestClient(c.env).select<ProfileRow>({ schema: "control", table: "business_profiles", query: { select: "id,slug,display_name,headline,location_name,address,status,published_at", slug: `eq.${c.req.param("slug")}`, status: "eq.published", limit: 1 } });
  if (!profile) return c.json({ error: "business_profile_not_found" }, 404);
  const links = await createSupabaseRestClient(c.env).select<LinkRow>({ schema: "control", table: "business_profile_links", query: { select: "id,profile_id,kind,label,href,enabled,sort_order", profile_id: `eq.${profile.id}`, enabled: "eq.true", order: "sort_order.asc" } });
  return c.json({ profile: { slug: profile.slug, displayName: profile.display_name, headline: profile.headline ?? undefined, locationName: profile.location_name ?? undefined, address: profile.address ?? undefined }, links: links.map((link) => ({ kind: link.kind, label: link.label ?? undefined, href: link.href, sortOrder: link.sort_order })) });
});

businessProfileRoutes.post("/admin/business-profiles", async (c) => {
  const actor = await requireSystemAdmin(c as DashboardContext);
  if (actor instanceof Response) return actor;
  const body: unknown = await c.req.json().catch(() => undefined);
  if (!isRecord(body) || typeof body.displayName !== "string" || !body.displayName.trim()) return c.json({ error: "business_profile_invalid" }, 400);
  const displayName = body.displayName.trim().slice(0, 160);
  const slug = slugify(typeof body.slug === "string" ? body.slug : displayName);
  if (!slug) return c.json({ error: "business_profile_slug_invalid" }, 400);
  const [created] = await createSupabaseRestClient(c.env).insertReturning<ProfileRow>({ schema: "control", table: "business_profiles", rows: { slug, display_name: displayName, status: "draft", created_by: actor.id } });
  if (!created) return c.json({ error: "business_profile_create_failed" }, 502);
  return c.json({ profile: mapProfile(created) }, 201);
});

businessProfileRoutes.get("/admin/business-profiles/:id", async (c) => {
  const actor = await requireSystemAdmin(c as DashboardContext);
  if (actor instanceof Response) return actor;
  const [profile] = await createSupabaseRestClient(c.env).select<ProfileRow>({ schema: "control", table: "business_profiles", query: { select: "*", id: `eq.${c.req.param("id")}`, limit: 1 } });
  if (!profile) return c.json({ error: "business_profile_not_found" }, 404);
  const links = await createSupabaseRestClient(c.env).select<LinkRow>({ schema: "control", table: "business_profile_links", query: { select: "*", profile_id: `eq.${profile.id}`, order: "sort_order.asc" } });
  return c.json({ profile: mapProfile(profile), links: links.map(mapLink) });
});

businessProfileRoutes.post("/admin/business-profiles/:id/publish", async (c) => {
  const actor = await requireSystemAdmin(c as DashboardContext);
  if (actor instanceof Response) return actor;
  const [profile] = await createSupabaseRestClient(c.env).updateReturning<ProfileRow>({ schema: "control", table: "business_profiles", query: { id: `eq.${c.req.param("id")}`, status: "eq.draft" }, patch: { status: "published", published_at: new Date().toISOString(), revision: 2, updated_at: new Date().toISOString() } });
  if (!profile) return c.json({ error: "business_profile_not_found_or_not_draft" }, 409);
  return c.json({ profile: mapProfile(profile) });
});

function mapProfile(row: ProfileRow) { return { id: row.id, slug: row.slug, tenantId: row.tenant_id ?? undefined, displayName: row.display_name, headline: row.headline ?? undefined, locationName: row.location_name ?? undefined, address: row.address ?? undefined, status: row.status, revision: row.revision, publishedAt: row.published_at ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at }; }
function mapLink(row: LinkRow) { return { id: row.id, kind: row.kind, label: row.label ?? undefined, href: row.href, enabled: row.enabled, sortOrder: row.sort_order }; }
function slugify(value: string) { return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
