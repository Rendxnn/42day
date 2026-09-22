import type { ApiBindings } from "../../lib/bindings.ts";
import { createSupabaseRestClient } from "../../lib/supabase-rest.ts";

export type DynamicLinkUnitRow = {
  id: string;
  public_code: string;
  batch_id?: string | null;
  label: string;
  tenant_id?: string | null;
  location_id?: string | null;
  location_label_snapshot?: string | null;
  destination_type?: string | null;
  destination_url?: string | null;
  profile_id?: string | null;
  status: string;
  revision: number;
  nfc_uid?: string | null;
  qr_printed_at?: string | null;
  nfc_programmed_at?: string | null;
  nfc_verified_at?: string | null;
  nfc_locked_at?: string | null;
  activated_at?: string | null;
  created_at: string;
  updated_at: string;
};

type BatchRow = { id: string; label: string; supplier_reference?: string | null; notes?: string | null; created_at: string };
type TenantRow = { id: string; name: string; status: string };

const unitSelect = "id,public_code,batch_id,label,tenant_id,location_id,location_label_snapshot,destination_type,destination_url,profile_id,status,revision,nfc_uid,qr_printed_at,nfc_programmed_at,nfc_verified_at,nfc_locked_at,activated_at,created_at,updated_at";

export async function findDynamicLinkUnitByCode(env: ApiBindings, publicCode: string) {
  const [unit] = await createSupabaseRestClient(env).select<DynamicLinkUnitRow>({
    schema: "control",
    table: "dynamic_link_units",
    query: { select: unitSelect, public_code: `eq.${publicCode}`, limit: 1 },
  });
  return unit;
}

export async function findDynamicLinkUnitById(env: ApiBindings, id: string) {
  const [unit] = await createSupabaseRestClient(env).select<DynamicLinkUnitRow>({
    schema: "control",
    table: "dynamic_link_units",
    query: { select: unitSelect, id: `eq.${id}`, limit: 1 },
  });
  return unit;
}

export async function listDynamicLinkUnitsByIds(env: ApiBindings, ids: string[]) {
  if (ids.length === 0) return [];
  const safeIds = ids.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
  if (safeIds.length !== ids.length) throw new Error("dynamic_link_unit_ids_invalid");
  return createSupabaseRestClient(env).select<DynamicLinkUnitRow>({
    schema: "control",
    table: "dynamic_link_units",
    query: { select: unitSelect, id: `in.(${safeIds.join(",")})`, limit: 100 },
  });
}

export async function findTenantStatus(env: ApiBindings, tenantId: string) {
  const [tenant] = await createSupabaseRestClient(env).select<TenantRow>({
    schema: "control",
    table: "tenants",
    query: { select: "id,name,status", id: `eq.${tenantId}`, limit: 1 },
  });
  return tenant;
}

export async function listDynamicLinkUnits(env: ApiBindings, filters: {
  query?: string;
  status?: string;
  tenantId?: string;
  batchId?: string;
  limit: number;
  offset: number;
}) {
  const query: Record<string, string | number | undefined> = {
    select: unitSelect,
    order: "updated_at.desc",
    limit: filters.limit,
    offset: filters.offset,
    status: filters.status ? `eq.${filters.status}` : undefined,
    tenant_id: filters.tenantId ? `eq.${filters.tenantId}` : undefined,
    batch_id: filters.batchId ? `eq.${filters.batchId}` : undefined,
  };
  if (filters.query) {
    const search = filters.query.replace(/[(),]/g, "").replace(/\*/g, "");
    query.or = `(public_code.ilike.*${search}*,label.ilike.*${search}*,location_label_snapshot.ilike.*${search}*)`;
  }
  return createSupabaseRestClient(env).select<DynamicLinkUnitRow>({ schema: "control", table: "dynamic_link_units", query });
}

export type DynamicLinkPageRow = {
  units: DynamicLinkUnitRow[];
  totalCount: number;
  hasNext: boolean;
};

export async function listDynamicLinkUnitsPage(env: ApiBindings, filters: {
  query?: string;
  status?: string;
  tenantId?: string;
  batchId?: string;
  sort: "updatedAt" | "createdAt" | "code" | "label" | "status";
  direction: "asc" | "desc";
  pageSize: 25 | 50 | 100;
  cursorValue?: string;
  cursorId?: string;
}): Promise<DynamicLinkPageRow> {
  return createSupabaseRestClient(env).rpc<DynamicLinkPageRow>({
    schema: "control",
    functionName: "list_dynamic_link_units_page",
    args: {
      p_query: filters.query ?? null,
      p_status: filters.status ?? null,
      p_tenant_id: filters.tenantId ?? null,
      p_batch_id: filters.batchId ?? null,
      p_sort: filters.sort,
      p_direction: filters.direction,
      p_page_size: filters.pageSize,
      p_cursor_value: filters.cursorValue ?? null,
      p_cursor_id: filters.cursorId ?? null,
    },
  });
}

export async function listAllDynamicLinkUnits(env: ApiBindings, filters: {
  query?: string;
  status?: string;
  tenantId?: string;
  batchId?: string;
}): Promise<DynamicLinkUnitRow[]> {
  const units: DynamicLinkUnitRow[] = [];
  let cursorValue: string | undefined;
  let cursorId: string | undefined;
  do {
    const page = await listDynamicLinkUnitsPage(env, {
      ...filters,
      sort: "updatedAt",
      direction: "desc",
      pageSize: 100,
      cursorValue,
      cursorId,
    });
    units.push(...page.units);
    const last = page.units.at(-1);
    cursorValue = last?.updated_at;
    cursorId = last?.id;
    if (!page.hasNext) break;
  } while (cursorValue && cursorId);
  return units;
}

export async function listDynamicLinkAuditEvents(env: ApiBindings, unitId: string) {
  return createSupabaseRestClient(env).select<Record<string, unknown>>({
    schema: "control",
    table: "dynamic_link_audit_events",
    query: {
      select: "id,unit_id,batch_id,actor_user_id,event_type,before_state,after_state,metadata,created_at",
      unit_id: `eq.${unitId}`,
      order: "created_at.desc",
      limit: 200,
    },
  });
}

export async function createDynamicLinkBatch(env: ApiBindings, input: {
  requestId: string;
  label: string;
  supplierReference?: string;
  notes?: string;
  actorUserId: string;
  units: Array<{ publicCode: string; label: string }>;
}) {
  return createSupabaseRestClient(env).rpc<Record<string, unknown>>({
    schema: "control",
    functionName: "create_dynamic_link_batch",
    args: {
      p_request_id: input.requestId,
      p_label: input.label,
      p_supplier_reference: input.supplierReference ?? null,
      p_notes: input.notes ?? null,
      p_actor_user_id: input.actorUserId,
      p_units: input.units.map((unit) => ({ public_code: unit.publicCode, label: unit.label })),
    },
  });
}

export async function updateDynamicLinkUnit(env: ApiBindings, input: {
  unitId: string;
  revision: number;
  actorUserId: string;
  eventType: string;
  patch: Record<string, unknown>;
}) {
  const result = await createSupabaseRestClient(env).rpc<DynamicLinkUnitRow | DynamicLinkUnitRow[]>({
    schema: "control",
    functionName: "update_dynamic_link_unit",
    args: {
      p_unit_id: input.unitId,
      p_expected_revision: input.revision,
      p_actor_user_id: input.actorUserId,
      p_event_type: input.eventType,
      p_patch: input.patch,
    },
  });
  const unit = Array.isArray(result) ? result[0] : result;
  if (!unit) throw new Error("dynamic_link_update_empty");
  return unit;
}

export async function quickConfigureDynamicLinkWithProfile(env: ApiBindings, input: {
  unitId: string;
  revision: number;
  actorUserId: string;
  profile: Record<string, unknown>;
  publicBaseUrl: string;
}) {
  const result = await createSupabaseRestClient(env).rpc<{ unit: DynamicLinkUnitRow }>({
    schema: "control",
    functionName: "quick_configure_dynamic_link_with_profile",
    args: {
      p_unit_id: input.unitId,
      p_expected_revision: input.revision,
      p_actor_user_id: input.actorUserId,
      p_profile: input.profile,
      p_public_base_url: input.publicBaseUrl,
    },
  });
  if (!result?.unit) throw new Error("dynamic_link_update_empty");
  return result;
}

export async function applyDynamicLinkBulkConfiguration(env: ApiBindings, input: {
  operationId: string;
  actorUserId: string;
  units: Array<{ id: string; revision: number }>;
  target: Record<string, unknown>;
  consentedActiveUnitIds: string[];
  commandHash: string;
}) {
  return createSupabaseRestClient(env).rpc<Record<string, unknown>>({
    schema: "control",
    functionName: "apply_dynamic_link_bulk_configuration",
    args: {
      p_operation_id: input.operationId,
      p_actor_user_id: input.actorUserId,
      p_units: input.units,
      p_target: input.target,
      p_consented_active_ids: input.consentedActiveUnitIds,
      p_command_hash: input.commandHash,
    },
  });
}

export async function createNfcHandoffSession(env: ApiBindings, input: { tokenHash: string; unitId: string; actorUserId: string; expiresAt: string }) {
  return createSupabaseRestClient(env).rpc<Record<string, unknown>>({
    schema: "control",
    functionName: "create_nfc_handoff_session",
    args: { p_token_hash: input.tokenHash, p_unit_id: input.unitId, p_actor_user_id: input.actorUserId, p_expires_at: input.expiresAt },
  });
}

export async function consumeNfcHandoffSession(env: ApiBindings, input: { sessionId: string; tokenHash: string; actorUserId: string; reportedUid?: string }) {
  return createSupabaseRestClient(env).rpc<Record<string, unknown>>({
    schema: "control",
    functionName: "consume_nfc_handoff_session",
    args: { p_session_id: input.sessionId, p_token_hash: input.tokenHash, p_actor_user_id: input.actorUserId, p_reported_uid: input.reportedUid ?? null },
  });
}

export async function listDynamicLinkBatches(env: ApiBindings) {
  return createSupabaseRestClient(env).select<BatchRow>({
    schema: "control",
    table: "dynamic_link_batches",
    query: { select: "id,label,supplier_reference,notes,created_at", order: "created_at.desc", limit: 100 },
  });
}
