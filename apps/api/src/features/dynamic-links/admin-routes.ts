import { DynamicLinkValidationError } from "@42day/core";
import { Hono, type Context } from "hono";
import type { ApiBindings } from "../../lib/bindings.ts";
import { logEvent } from "../../lib/observability/logger.ts";
import { SupabaseRestError } from "../../lib/supabase-rest.ts";
import { requireSystemAdmin } from "../dashboard/auth.ts";
import { listAdminRestaurants } from "../dashboard/support/admin.ts";
import type { DashboardContext, DashboardVariables } from "../dashboard/types.ts";
import {
  createDynamicLinkBatch,
  findDynamicLinkUnitByCode,
  findDynamicLinkUnitById,
  findTenantStatus,
  listDynamicLinkAuditEvents,
  listDynamicLinkBatches,
  listAllDynamicLinkUnits,
  listDynamicLinkUnitsPage,
  listDynamicLinkUnits,
  listDynamicLinkUnitsByIds,
  updateDynamicLinkUnit,
  quickConfigureDynamicLinkWithProfile,
  applyDynamicLinkBulkConfiguration,
  createNfcHandoffSession,
  consumeNfcHandoffSession,
} from "./repository.ts";
import { createDynamicLinkCode, dashboardBaseUrl, inferDestinationType, isDestinationType, normalizePublicCode, randomToken, sha256Hex, toDynamicLinkUnit, validateAdminDestination } from "./service.ts";
import { GoogleReviewResolutionError, resolveGoogleReviewDestination } from "./google-review-resolver.ts";
import { findBusinessProfile } from "../public-profile/business-profile-repository.ts";
import { BusinessProfileValidationError, normalizeLink } from "../public-profile/business-profile-validation.ts";

type UpdateBody = {
  revision?: number;
  label?: string;
  tenantId?: string | null;
  locationId?: string | null;
  locationLabelSnapshot?: string | null;
  destinationType?: string | null;
  destinationUrl?: string | null;
  profileId?: string | null;
  nfcUid?: string | null;
};

type QuickConfigurationBody = {
  revision?: number;
  label?: string;
  destinationUrl?: string;
  tenantId?: string | null;
  target?: Record<string, unknown>;
};

export const dynamicLinkAdminRoutes = new Hono<{ Bindings: ApiBindings; Variables: DashboardVariables }>();

dynamicLinkAdminRoutes.get("/admin/dynamic-links", async (c) => {
  const authUser = await requireSystemAdmin(c as DashboardContext);
  if (authUser instanceof Response) return authUser;
  const sort = parseSort(c.req.query("sort"));
  const direction = parseDirection(c.req.query("direction"));
  const pageSize = parsePageSize(c.req.query("pageSize"));
  if (!sort || !direction || !pageSize) return c.json({ error: "dynamic_link_page_invalid" }, 400);
  const inventoryQuery: InventoryQuery = { query: c.req.query("query")?.trim() || undefined, status: c.req.query("status"), tenantId: c.req.query("tenantId"), batchId: c.req.query("batchId"), sort, direction, pageSize };
  const cursor = parseCursor(c.req.query("cursor"), inventoryQuery);
  if (cursor instanceof Response) return c.json({ error: "dynamic_link_page_invalid" }, 400);
  try {
    const page = await listDynamicLinkUnitsPage(c.env, {
      query: c.req.query("query")?.trim() || undefined,
      status: isStatus(c.req.query("status")) ? c.req.query("status") : undefined,
      tenantId: c.req.query("tenantId") || undefined,
      batchId: c.req.query("batchId") || undefined,
      sort,
      direction,
      pageSize,
      cursorValue: cursor?.value,
      cursorId: cursor?.id,
    });
    const units = page.units.map((unit) => toDynamicLinkUnit(unit, c.env));
    const last = units.at(-1);
    const nextCursor = page.hasNext && last ? createCursor(inventoryQuery, { value: cursorValue(last, sort), id: last.id }) : undefined;
    return c.json({ units, totalCount: page.totalCount, pageInfo: { hasNext: page.hasNext, ...(nextCursor ? { nextCursor } : {}) } });
  } catch (error) {
    return dynamicLinkError(c, error);
  }
});

dynamicLinkAdminRoutes.get("/admin/dynamic-links/batches", async (c) => {
  const authUser = await requireSystemAdmin(c as DashboardContext);
  if (authUser instanceof Response) return authUser;
  const batches = await listDynamicLinkBatches(c.env);
  return c.json({ batches: batches.map((batch) => ({
    id: batch.id,
    label: batch.label,
    supplierReference: batch.supplier_reference ?? undefined,
    notes: batch.notes ?? undefined,
    createdAt: batch.created_at,
  })) });
});

dynamicLinkAdminRoutes.post("/admin/dynamic-links/batches", async (c) => {
  const authUser = await requireSystemAdmin(c as DashboardContext);
  if (authUser instanceof Response) return authUser;
  const body = await c.req.json().catch(() => ({})) as { requestId?: string; label?: string; count?: number; supplierReference?: string; notes?: string };
  const requestId = String(body.requestId ?? "").trim();
  const label = String(body.label ?? "").trim();
  const count = clampInteger(body.count, 1, 500, 0);
  if (!isUuid(requestId) || !label || !count) return c.json({ error: "dynamic_link_batch_invalid" }, 400);
  const units = Array.from({ length: count }, (_, index) => ({
    publicCode: createDynamicLinkCode(),
    label: count === 1 ? label : `${label} ${String(index + 1).padStart(3, "0")}`,
  }));
  try {
    const payload = await createDynamicLinkBatch(c.env, {
      requestId,
      label,
      supplierReference: body.supplierReference,
      notes: body.notes,
      actorUserId: authUser.id,
      units,
    });
    return c.json(payload, 201);
  } catch (error) {
    return dynamicLinkError(c, error);
  }
});

dynamicLinkAdminRoutes.get("/admin/dynamic-links/by-code/:code", async (c) => {
  const authUser = await requireSystemAdmin(c as DashboardContext);
  if (authUser instanceof Response) return authUser;
  const publicCode = normalizePublicCode(c.req.param("code"));
  if (!publicCode) return c.json({ error: "dynamic_link_code_invalid" }, 400);
  let unit;
  try {
    unit = await findDynamicLinkUnitByCode(c.env, publicCode);
  } catch (error) {
    return dynamicLinkError(c, error);
  }
  if (!unit) return c.json({ error: "dynamic_link_not_found" }, 404);
  return c.json({ unit: toDynamicLinkUnit(unit, c.env) });
});

dynamicLinkAdminRoutes.get("/admin/dynamic-links/:id", async (c) => {
  const authUser = await requireSystemAdmin(c as DashboardContext);
  if (authUser instanceof Response) return authUser;
  const unit = await findDynamicLinkUnitById(c.env, c.req.param("id"));
  if (!unit) return c.json({ error: "dynamic_link_not_found" }, 404);
  return c.json({ unit: toDynamicLinkUnit(unit, c.env) });
});

dynamicLinkAdminRoutes.post("/admin/dynamic-links/google-review/resolve", async (c) => {
  const authUser = await requireSystemAdmin(c as DashboardContext);
  if (authUser instanceof Response) return authUser;

  const body: unknown = await c.req.json().catch(() => undefined);
  if (!isRecord(body) || typeof body.destinationUrl !== "string") {
    return c.json({ error: "google_review_url_invalid" }, 400);
  }

  const startedAt = Date.now();
  try {
    const result = await resolveGoogleReviewDestination(body.destinationUrl);
    logEvent("info", "dynamic_link.google_review_resolution_succeeded", "Se preparó un candidato de reseña de Google.", {
      actorUserId: authUser.id,
      inputHost: safeHostname(body.destinationUrl),
      sourceKind: result.resolution.sourceKind,
      redirectCount: result.redirectCount,
      durationMs: Date.now() - startedAt,
    });
    return c.json({ resolution: result.resolution });
  } catch (error) {
    if (error instanceof GoogleReviewResolutionError) {
      logEvent("warn", "dynamic_link.google_review_resolution_failed", "No fue posible preparar el candidato de reseña de Google.", {
        actorUserId: authUser.id,
        inputHost: safeHostname(body.destinationUrl),
        outcome: error.code,
        durationMs: Date.now() - startedAt,
      });
      return c.json({ error: error.code }, error.status);
    }
    throw error;
  }
});

dynamicLinkAdminRoutes.patch("/admin/dynamic-links/:id/quick-configuration", async (c) => {
  const authUser = await requireSystemAdmin(c as DashboardContext);
  if (authUser instanceof Response) return authUser;
  const body = await c.req.json().catch(() => ({})) as QuickConfigurationBody;
  if (typeof body.revision !== "number" || !Number.isInteger(body.revision) || body.revision < 1) return c.json({ error: "dynamic_link_revision_invalid" }, 400);
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label || label.length > 160) return c.json({ error: "dynamic_link_label_invalid" }, 400);

  if (isRecord(body.target) && body.target.kind === "profile") {
    const profileTarget = parseQuickProfileTarget(body.target);
    if (profileTarget instanceof Response) return profileTarget;
    let current;
    try { current = await findDynamicLinkUnitById(c.env, c.req.param("id")); } catch (error) { return dynamicLinkError(c, error); }
    if (!current) return c.json({ error: "dynamic_link_not_found" }, 404);
    if (current.status === "archived") return c.json({ error: "dynamic_link_archived" }, 409);
    try {
      const result = await quickConfigureDynamicLinkWithProfile(c.env, {
        unitId: current.id,
        revision: body.revision,
        actorUserId: authUser.id,
        profile: profileTarget,
        publicBaseUrl: dashboardBaseUrl(c.env),
      });
      return c.json({ unit: toDynamicLinkUnit(result.unit, c.env) });
    } catch (error) {
      return dynamicLinkError(c, error);
    }
  }

  if (typeof body.destinationUrl !== "string" || !body.destinationUrl.trim()) return c.json({ error: "dynamic_link_destination_invalid" }, 400);

  let current;
  try {
    current = await findDynamicLinkUnitById(c.env, c.req.param("id"));
  } catch (error) {
    return dynamicLinkError(c, error);
  }
  if (!current) return c.json({ error: "dynamic_link_not_found" }, 404);
  if (current.status === "archived") return c.json({ error: "dynamic_link_archived" }, 409);

  let destinationType: ReturnType<typeof inferDestinationType>;
  let destinationUrl: string;
  try {
    destinationType = inferDestinationType(body.destinationUrl, c.env);
    destinationUrl = validateAdminDestination(destinationType, body.destinationUrl, c.env, {
      destinationType: current.destination_type,
      destinationUrl: current.destination_url,
    });
  } catch (error) {
    if (error instanceof DynamicLinkValidationError) return c.json({ error: error.code }, 400);
    throw error;
  }

  const patch: Record<string, unknown> = {
    label,
    destination_type: destinationType,
    destination_url: destinationUrl,
    status: "active",
  };
  if (body.tenantId !== undefined) {
    if (body.tenantId === null) {
      patch.tenant_id = null;
      patch.location_id = null;
      patch.location_label_snapshot = null;
    } else if (typeof body.tenantId === "string" && isUuid(body.tenantId)) {
      let restaurant;
      try {
        restaurant = (await listAdminRestaurants(c.env)).find((candidate) => candidate.id === body.tenantId);
      } catch (error) {
        return dynamicLinkError(c, error);
      }
      if (!restaurant) return c.json({ error: "dynamic_link_tenant_not_found" }, 400);
      patch.tenant_id = restaurant.id;
      patch.location_id = restaurant.location?.id ?? null;
      patch.location_label_snapshot = restaurant.location?.name ?? null;
    } else {
      return c.json({ error: "dynamic_link_tenant_invalid" }, 400);
    }
  }

  try {
    const updated = await updateDynamicLinkUnit(c.env, {
      unitId: current.id,
      revision: body.revision,
      actorUserId: authUser.id,
      eventType: current.status === "active" ? "updated" : "activated",
      patch,
    });
    return c.json({ unit: toDynamicLinkUnit(updated, c.env) });
  } catch (error) {
    return dynamicLinkError(c, error);
  }
});

dynamicLinkAdminRoutes.post("/admin/dynamic-links/bulk-configuration/preflight", async (c) => {
  const authUser = await requireSystemAdmin(c as DashboardContext);
  if (authUser instanceof Response) return authUser;
  const body = await c.req.json().catch(() => ({}));
  const parsed = parseBulkRequest(body, false);
  if (parsed instanceof Response) return parsed;
  try {
    const rows = await listDynamicLinkUnitsByIds(c.env, parsed.units.map((unit) => unit.id));
    const byId = new Map(rows.map((row) => [row.id, row]));
    const eligible = [] as ReturnType<typeof toDynamicLinkUnit>[];
    const protectedUnits = [] as ReturnType<typeof toDynamicLinkUnit>[];
    const excluded: Array<Record<string, unknown>> = [];
    for (const reference of parsed.units) {
      const row = byId.get(reference.id);
      if (!row) { excluded.push({ id: reference.id, reason: "not_found" }); continue; }
      const unit = toDynamicLinkUnit(row, c.env);
      if (row.revision !== reference.revision) { excluded.push({ ...unit, reason: "stale" }); continue; }
      if (row.status === "archived") { excluded.push({ ...unit, reason: "archived" }); continue; }
      if (row.status === "active") protectedUnits.push(unit);
      else eligible.push(unit);
    }
    return c.json({ eligible, protected: protectedUnits, excluded, target: parsed.target });
  } catch (error) {
    return dynamicLinkError(c, error);
  }
});

dynamicLinkAdminRoutes.post("/admin/dynamic-links/bulk-configuration", async (c) => {
  const authUser = await requireSystemAdmin(c as DashboardContext);
  if (authUser instanceof Response) return authUser;
  const body = await c.req.json().catch(() => ({}));
  const parsed = parseBulkRequest(body, true);
  if (parsed instanceof Response) return parsed;
  const operationId = isRecord(body) && typeof body.operationId === "string" && isUuid(body.operationId) ? body.operationId : "";
  const consentedActiveUnitIds = isRecord(body) && Array.isArray(body.consentedActiveUnitIds) && body.consentedActiveUnitIds.every((id) => typeof id === "string" && isUuid(id)) ? body.consentedActiveUnitIds as string[] : null;
  if (!operationId || !consentedActiveUnitIds) return c.json({ error: "dynamic_link_bulk_request_invalid" }, 400);
  const command = { operationId, units: parsed.units, target: parsed.target, consentedActiveUnitIds };
  try {
    const rpcTarget = await resolveBulkRpcTarget(c.env, parsed.target);
    const result = await applyDynamicLinkBulkConfiguration(c.env, {
      operationId,
      actorUserId: authUser.id,
      units: parsed.units,
      target: rpcTarget,
      consentedActiveUnitIds,
      commandHash: await sha256Hex(stableJson(command)),
    });
    return c.json(result);
  } catch (error) {
    return dynamicLinkError(c, error);
  }
});

dynamicLinkAdminRoutes.post("/admin/dynamic-links/:id/nfc-handoff", async (c) => {
  const authUser = await requireSystemAdmin(c as DashboardContext);
  if (authUser instanceof Response) return authUser;
  const unit = await findDynamicLinkUnitById(c.env, c.req.param("id"));
  if (!unit) return c.json({ error: "dynamic_link_not_found" }, 404);
  if (unit.status === "archived") return c.json({ error: "dynamic_link_archived" }, 409);
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const session = await createNfcHandoffSession(c.env, { tokenHash: await sha256Hex(token), unitId: unit.id, actorUserId: authUser.id, expiresAt });
  const sessionId = String(session.id ?? "");
  if (!isUuid(sessionId)) return c.json({ error: "nfc_handoff_failed" }, 502);
  const callbackUrl = new URL(`/admin/dynamic-links/nfc-callback?session=${encodeURIComponent(sessionId)}`, dashboardBaseUrl(c.env)).toString();
  const handoffUrl = `nfchelper://write?url=${encodeURIComponent(toDynamicLinkUnit(unit, c.env).publicUrl)}&callback=${encodeURIComponent(callbackUrl)}`;
  return c.json({ sessionId, token, expiresAt, handoffUrl });
});

dynamicLinkAdminRoutes.post("/admin/nfc-handoff/:sessionId/consume", async (c) => {
  const authUser = await requireSystemAdmin(c as DashboardContext);
  if (authUser instanceof Response) return authUser;
  const sessionId = c.req.param("sessionId");
  const body = await c.req.json().catch(() => ({}));
  if (!isUuid(sessionId) || !isRecord(body) || typeof body.token !== "string" || body.token.length < 20 || (body.reportedUid !== undefined && typeof body.reportedUid !== "string")) {
    return c.json({ error: "nfc_handoff_request_invalid" }, 400);
  }
  try {
    const result = await consumeNfcHandoffSession(c.env, { sessionId, tokenHash: await sha256Hex(body.token), actorUserId: authUser.id, reportedUid: body.reportedUid });
    return c.json(result);
  } catch (error) {
    return dynamicLinkError(c, error);
  }
});

dynamicLinkAdminRoutes.patch("/admin/dynamic-links/:id", async (c) => {
  const authUser = await requireSystemAdmin(c as DashboardContext);
  if (authUser instanceof Response) return authUser;
  const body = await c.req.json().catch(() => ({})) as UpdateBody;
  const revision = body.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1) return c.json({ error: "dynamic_link_revision_invalid" }, 400);
  const current = await findDynamicLinkUnitById(c.env, c.req.param("id"));
  if (!current) return c.json({ error: "dynamic_link_not_found" }, 404);

  const patch = await normalizeUpdatePatch(c.env, current, body);
  if (patch instanceof Response) return patch;
  try {
    const updated = await updateDynamicLinkUnit(c.env, {
      unitId: current.id,
      revision,
      actorUserId: authUser.id,
      eventType: "updated",
      patch,
    });
    return c.json({ unit: toDynamicLinkUnit(updated, c.env) });
  } catch (error) {
    return dynamicLinkError(c, error);
  }
});

dynamicLinkAdminRoutes.post("/admin/dynamic-links/:id/:action", async (c) => {
  const authUser = await requireSystemAdmin(c as DashboardContext);
  if (authUser instanceof Response) return authUser;
  const body = await c.req.json().catch(() => ({})) as { revision?: number; nfcUid?: string };
  const revision = body.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1) return c.json({ error: "dynamic_link_revision_invalid" }, 400);
  const action = c.req.param("action");
  const actions: Record<string, { eventType: string; patch: Record<string, unknown> }> = {
    activate: { eventType: "activated", patch: { status: "active" } },
    suspend: { eventType: "suspended", patch: { status: "suspended" } },
    archive: { eventType: "archived", patch: { status: "archived" } },
    "mark-qr-printed": { eventType: "qr_printed", patch: { qr_printed_at: new Date().toISOString() } },
    "mark-nfc-programmed": { eventType: "nfc_programmed", patch: { nfc_programmed_at: new Date().toISOString(), ...(body.nfcUid ? { nfc_uid: body.nfcUid.trim() } : {}) } },
    "mark-nfc-verified": { eventType: "nfc_verified", patch: { nfc_verified_at: new Date().toISOString() } },
    "mark-nfc-locked": { eventType: "nfc_locked", patch: { nfc_locked_at: new Date().toISOString() } },
  };
  const command = actions[action];
  if (!command) return c.json({ error: "dynamic_link_action_invalid" }, 400);
  try {
    const updated = await updateDynamicLinkUnit(c.env, {
      unitId: c.req.param("id"),
      revision,
      actorUserId: authUser.id,
      eventType: command.eventType,
      patch: command.patch,
    });
    return c.json({ unit: toDynamicLinkUnit(updated, c.env) });
  } catch (error) {
    return dynamicLinkError(c, error);
  }
});

dynamicLinkAdminRoutes.get("/admin/dynamic-links/:id/audit", async (c) => {
  const authUser = await requireSystemAdmin(c as DashboardContext);
  if (authUser instanceof Response) return authUser;
  const unit = await findDynamicLinkUnitById(c.env, c.req.param("id"));
  if (!unit) return c.json({ error: "dynamic_link_not_found" }, 404);
  const events = await listDynamicLinkAuditEvents(c.env, unit.id);
  return c.json({ events: events.map((event) => ({
    id: String(event.id),
    unitId: String(event.unit_id),
    actorUserId: typeof event.actor_user_id === "string" ? event.actor_user_id : undefined,
    eventType: String(event.event_type),
    beforeState: isRecord(event.before_state) ? event.before_state : undefined,
    afterState: isRecord(event.after_state) ? event.after_state : undefined,
    metadata: isRecord(event.metadata) ? event.metadata : undefined,
    createdAt: String(event.created_at),
  })) });
});

dynamicLinkAdminRoutes.get("/admin/dynamic-links/export", async (c) => {
  const authUser = await requireSystemAdmin(c as DashboardContext);
  if (authUser instanceof Response) return authUser;
  const units = await listAllDynamicLinkUnits(c.env, {
    query: c.req.query("query")?.trim() || undefined,
    status: isStatus(c.req.query("status")) ? c.req.query("status") : undefined,
    tenantId: c.req.query("tenantId") || undefined,
    batchId: c.req.query("batchId") || undefined,
  });
  const csv = [
    "code,url,label,status,batch_id,tenant_id,location,nfc_uid",
    ...units.map((unit) => [unit.public_code, toDynamicLinkUnit(unit, c.env).publicUrl, unit.label, unit.status, unit.batch_id ?? "", unit.tenant_id ?? "", unit.location_label_snapshot ?? "", unit.nfc_uid ?? ""].map(csvCell).join(",")),
  ].join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="dynamic-links.csv"', "Cache-Control": "no-store" } });
});

async function normalizeUpdatePatch(env: ApiBindings, current: NonNullable<Awaited<ReturnType<typeof findDynamicLinkUnitById>>>, body: UpdateBody) {
  const patch: Record<string, unknown> = {};
  if (body.label !== undefined) {
    const label = body.label.trim();
    if (!label || label.length > 160) return new Response(JSON.stringify({ error: "dynamic_link_label_invalid" }), { status: 400, headers: { "Content-Type": "application/json" } });
    patch.label = label;
  }
  if (body.tenantId !== undefined) {
    if (body.tenantId) {
      const tenant = await findTenantStatus(env, body.tenantId);
      if (!tenant) return new Response(JSON.stringify({ error: "dynamic_link_tenant_not_found" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    patch.tenant_id = body.tenantId;
  }
  if (body.locationId !== undefined) patch.location_id = body.locationId;
  if (body.locationLabelSnapshot !== undefined) patch.location_label_snapshot = body.locationLabelSnapshot;
  if (body.nfcUid !== undefined) patch.nfc_uid = body.nfcUid;

  const destinationType = body.destinationType === undefined ? current.destination_type : body.destinationType;
  const destinationUrl = body.destinationUrl === undefined ? current.destination_url : body.destinationUrl;
  if (body.destinationType !== undefined || body.destinationUrl !== undefined) {
    if ((destinationType === null || destinationType === "") && (destinationUrl === null || destinationUrl === "")) {
      patch.destination_type = null;
      patch.destination_url = null;
    } else if (!isDestinationType(destinationType) || (destinationType !== "profile" && typeof destinationUrl !== "string")) {
      return new Response(JSON.stringify({ error: "dynamic_link_destination_invalid" }), { status: 400, headers: { "Content-Type": "application/json" } });
    } else {
      try {
        if (destinationType === "profile") {
          const profileId = body.profileId ?? current.profile_id;
          if (typeof profileId !== "string") return new Response(JSON.stringify({ error: "business_profile_required" }), { status: 400, headers: { "Content-Type": "application/json" } });
          const profile = await findBusinessProfile(env, profileId);
          if (!profile || profile.profile.status !== "published") return new Response(JSON.stringify({ error: "business_profile_not_published" }), { status: 409, headers: { "Content-Type": "application/json" } });
          patch.profile_id = profile.profile.id;
          patch.tenant_id = profile.profile.tenantId ?? null;
          patch.location_id = null;
          patch.location_label_snapshot = profile.profile.locationName ?? null;
          patch.destination_type = "profile";
          patch.destination_url = new URL(`/p/${profile.profile.slug}`, dashboardBaseUrl(env)).toString();
        } else {
          if (typeof destinationUrl !== "string") return new Response(JSON.stringify({ error: "dynamic_link_destination_invalid" }), { status: 400, headers: { "Content-Type": "application/json" } });
          patch.profile_id = null;
          patch.destination_type = destinationType;
          patch.destination_url = validateAdminDestination(destinationType, destinationUrl, env, {
            destinationType: current.destination_type,
            destinationUrl: current.destination_url,
          });
        }
      } catch (error) {
        if (error instanceof DynamicLinkValidationError) return new Response(JSON.stringify({ error: error.code }), { status: 400, headers: { "Content-Type": "application/json" } });
        throw error;
      }
    }
  }
  return patch;
}

function dynamicLinkError(c: Context<{ Bindings: ApiBindings; Variables: DashboardVariables }>, error: unknown) {
  const message = error instanceof SupabaseRestError ? error.body : error instanceof Error ? error.message : "dynamic_link_update_failed";
  if (message.includes("dynamic_link_stale")) return c.json({ error: "dynamic_link_stale" }, 409);
  if (message.includes("dynamic_link_archived")) return c.json({ error: "dynamic_link_archived" }, 409);
  if (message.includes("dynamic_link_bulk_active_consent_required")) return c.json({ error: "dynamic_link_bulk_active_consent_required" }, 409);
  if (message.includes("dynamic_link_bulk_operation_reuse")) return c.json({ error: "dynamic_link_bulk_operation_reuse" }, 409);
  if (message.includes("dynamic_link_bulk_size_invalid") || message.includes("dynamic_link_bulk_request_invalid") || message.includes("dynamic_link_bulk_target_invalid")) return c.json({ error: "dynamic_link_bulk_request_invalid" }, 400);
  if (message.includes("business_profile_not_published") || message.includes("business_profile_disabled") || message.includes("business_profile_required")) return c.json({ error: message.match(/business_profile_[a-z_]+/)?.[0] ?? "business_profile_invalid" }, 409);
  if (message.includes("nfc_handoff_used") || message.includes("nfc_handoff_expired") || message.includes("nfc_handoff_invalid")) return c.json({ error: "nfc_handoff_invalid" }, 409);
  if (message.includes("nfc_handoff_forbidden")) return c.json({ error: "nfc_handoff_forbidden" }, 403);
  if (message.includes("nfc_handoff")) return c.json({ error: "nfc_handoff_invalid" }, 400);
  if (message.includes("dynamic_link_not_found")) return c.json({ error: "dynamic_link_not_found" }, 404);
  if (error instanceof SupabaseRestError) return c.json({ error: "dynamic_link_storage_failed" }, 502);
  return c.json({ error: "dynamic_link_invalid" }, 400);
}

function isStatus(value: string | undefined): value is "available" | "active" | "suspended" | "archived" {
  return value === "available" || value === "active" || value === "suspended" || value === "archived";
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

type InventoryQuery = { query?: string; status?: string; tenantId?: string; batchId?: string; sort: "updatedAt" | "createdAt" | "code" | "label" | "status"; direction: "asc" | "desc"; pageSize: 25 | 50 | 100 };
type InventoryCursor = { value: string; id: string; fingerprint: string };

function parseSort(value: string | undefined): InventoryQuery["sort"] | undefined {
  return value === undefined || value === "updatedAt" ? "updatedAt" : value === "createdAt" || value === "code" || value === "label" || value === "status" ? value : undefined;
}
function parseDirection(value: string | undefined): InventoryQuery["direction"] | undefined {
  return value === undefined || value === "desc" ? "desc" : value === "asc" ? "asc" : undefined;
}
function parsePageSize(value: string | undefined): InventoryQuery["pageSize"] | undefined {
  return value === undefined || value === "25" ? 25 : value === "50" ? 50 : value === "100" ? 100 : undefined;
}
function createCursor(query: InventoryQuery, cursor: { value: string; id: string }) {
  return btoa(JSON.stringify({ ...cursor, fingerprint: cursorFingerprint(query) }));
}
function parseCursor(value: string | undefined, query: InventoryQuery): InventoryCursor | undefined | Response {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(atob(value));
    if (!isRecord(parsed) || typeof parsed.value !== "string" || typeof parsed.id !== "string" || typeof parsed.fingerprint !== "string" || !isUuid(parsed.id) || parsed.fingerprint !== cursorFingerprint(query)) return new Response();
    return { value: parsed.value, id: parsed.id, fingerprint: parsed.fingerprint };
  } catch { return new Response(); }
}
function cursorFingerprint(query: InventoryQuery) {
  return JSON.stringify([query.query ?? "", query.status ?? "", query.tenantId ?? "", query.batchId ?? "", query.sort, query.direction, query.pageSize]);
}
function cursorValue(unit: ReturnType<typeof toDynamicLinkUnit>, sort: InventoryQuery["sort"]) {
  if (sort === "updatedAt") return unit.updatedAt;
  if (sort === "createdAt") return unit.createdAt;
  if (sort === "code") return unit.publicCode;
  if (sort === "label") return unit.label.toLowerCase();
  return unit.status;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeHostname(value: string) {
  try {
    return new URL(value.trim()).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

type BulkRequest = {
  units: Array<{ id: string; revision: number }>;
  target: {
    kind: "profile";
    profileId: string;
  } | {
    kind: "redirect";
    destinationType: Exclude<ReturnType<typeof inferDestinationType>, "profile">;
    destinationUrl: string;
    associationMode: "preserve" | "clear" | "set";
    tenantId?: string;
  };
};

function parseBulkRequest(value: unknown, allowApply: boolean): BulkRequest | Response {
  if (!isRecord(value) || !Array.isArray(value.units) || value.units.length < 2 || value.units.length > 100 || !isRecord(value.target)) {
    return new Response(JSON.stringify({ error: "dynamic_link_bulk_request_invalid" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  const units: Array<{ id: string; revision: number }> = [];
  const seen = new Set<string>();
  for (const item of value.units) {
    const revision = isRecord(item) && typeof item.revision === "number" ? item.revision : undefined;
    if (!isRecord(item) || typeof item.id !== "string" || !isUuid(item.id) || revision === undefined || !Number.isInteger(revision) || revision < 1 || seen.has(item.id)) {
      return new Response(JSON.stringify({ error: "dynamic_link_bulk_units_invalid" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    seen.add(item.id);
    units.push({ id: item.id, revision });
  }
  const target = value.target;
  if (target.kind === "profile") {
    if (typeof target.profileId !== "string" || !isUuid(target.profileId)) return new Response(JSON.stringify({ error: "business_profile_required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    return { units, target: { kind: "profile", profileId: target.profileId } };
  }
  if (target.kind !== "redirect" || typeof target.destinationType !== "string" || !isDestinationType(target.destinationType) || target.destinationType === "profile" || typeof target.destinationUrl !== "string" || !target.destinationUrl.trim() || !["preserve", "clear", "set"].includes(String(target.associationMode))) {
    return new Response(JSON.stringify({ error: "dynamic_link_bulk_target_invalid" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  if (target.associationMode === "set" && (typeof target.tenantId !== "string" || !isUuid(target.tenantId))) return new Response(JSON.stringify({ error: "dynamic_link_tenant_invalid" }), { status: 400, headers: { "Content-Type": "application/json" } });
  try {
    validateAdminDestination(target.destinationType, target.destinationUrl, { DYNAMIC_LINK_BASE_URL: undefined } as ApiBindings);
  } catch (error) {
    if (error instanceof DynamicLinkValidationError) return new Response(JSON.stringify({ error: error.code }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  const targetTenantId = typeof target.tenantId === "string" ? target.tenantId : undefined;
  return { units, target: { kind: "redirect", destinationType: target.destinationType, destinationUrl: target.destinationUrl.trim(), associationMode: target.associationMode as "preserve" | "clear" | "set", ...(targetTenantId ? { tenantId: targetTenantId } : {}) } };
}

function bulkTargetToRpc(target: BulkRequest["target"]): Record<string, unknown> {
  if (target.kind === "profile") return { kind: "profile", profile_id: target.profileId };
  return { kind: "redirect", destination_type: target.destinationType, destination_url: target.destinationUrl, association_mode: target.associationMode, ...(target.tenantId ? { tenant_id: target.tenantId } : {}) };
}

async function resolveBulkRpcTarget(env: ApiBindings, target: BulkRequest["target"]) {
  if (target.kind === "redirect") return bulkTargetToRpc(target);
  const profile = await findBusinessProfile(env, target.profileId);
  if (!profile || profile.profile.status === "disabled") throw new Error("business_profile_not_found");
  return { kind: "profile", profile_id: target.profileId, destination_url: new URL(`/p/${profile.profile.slug}`, dashboardBaseUrl(env)).toString() };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function parseQuickProfileTarget(target: Record<string, unknown>): Record<string, unknown> | Response {
  const profileId = typeof target.profileId === "string" && isUuid(target.profileId) ? target.profileId : undefined;
  if (target.profileId !== undefined && !profileId) return new Response(JSON.stringify({ error: "business_profile_invalid" }), { status: 400, headers: { "Content-Type": "application/json" } });
  if (profileId) return { profile_id: profileId };
  const creationRequestId = typeof target.creationRequestId === "string" && isUuid(target.creationRequestId) ? target.creationRequestId : undefined;
  const displayName = typeof target.displayName === "string" ? target.displayName.trim() : "";
  const slug = typeof target.slug === "string" ? target.slug.trim().toLowerCase() : displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!creationRequestId || !displayName || displayName.length > 160 || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return new Response(JSON.stringify({ error: "business_profile_request_invalid" }), { status: 400, headers: { "Content-Type": "application/json" } });
  const linksValue = target.links === undefined ? [] : target.links;
  if (!Array.isArray(linksValue) || linksValue.length > 30) return new Response(JSON.stringify({ error: "business_profile_links_invalid" }), { status: 400, headers: { "Content-Type": "application/json" } });
  try {
    const links = linksValue.filter((link) => isRecord(link) && link.enabled === true).map((link, index) => {
      const normalized = normalizeLink(link, index);
      return { kind: normalized.kind, label: normalized.label ?? null, href: normalized.href, enabled: normalized.enabled, sort_order: normalized.sortOrder };
    });
    const tenantId = target.tenantId === null ? null : target.tenantId === undefined ? null : typeof target.tenantId === "string" && isUuid(target.tenantId) ? target.tenantId : (() => { throw new BusinessProfileValidationError("business_profile_tenant_invalid"); })();
    return { creation_request_id: creationRequestId, slug, display_name: displayName, headline: target.headline, location_name: target.locationName, address: target.address, tenant_id: tenantId, links };
  } catch (error) {
    const code = error instanceof BusinessProfileValidationError ? error.code : "business_profile_invalid";
    return new Response(JSON.stringify({ error: code }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
}
