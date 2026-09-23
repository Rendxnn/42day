import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Archive, Check, Copy, Download, ExternalLink, Loader2, Lock, QrCode, Radio, RefreshCw, ScanLine, ShieldBan } from "lucide-react";
import {
  DashboardApiError,
  createDynamicLinkBatch,
  consumeNfcHandoff,
  getDynamicLinkById,
  getDynamicLinkAudit,
  listDynamicLinkBatches,
  listDynamicLinks,
  listBusinessProfiles,
  runDynamicLinkAction,
  updateDynamicLink,
} from "../../api";
import type { AdminRestaurant, BusinessProfile, DynamicLinkAuditEvent, DynamicLinkBatch, DynamicLinkDestinationType, DynamicLinkSortDirection, DynamicLinkSortField, DynamicLinkStatus, DynamicLinkUnit } from "../../api";
import { QuickDynamicLinkSetup } from "./QuickDynamicLinkSetup";
import { BulkDynamicLinkSetup } from "./BulkDynamicLinkSetup";

type Props = { restaurants: AdminRestaurant[] };

const destinationOptions: Array<{ value: DynamicLinkDestinationType; label: string }> = [
  { value: "google_review", label: "Google Reviews" },
  { value: "website", label: "Página web" },
  { value: "menu", label: "Menú o carta" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "profile", label: "Perfil de negocio" },
];

export function DynamicLinksSection({ restaurants }: Props) {
  const [units, setUnits] = useState<DynamicLinkUnit[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<DynamicLinkStatus | "">("");
  const [tenantFilter, setTenantFilter] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [sort, setSort] = useState<DynamicLinkSortField>("updatedAt");
  const [direction, setDirection] = useState<DynamicLinkSortDirection>("desc");
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [totalCount, setTotalCount] = useState(0);
  const [batches, setBatches] = useState<DynamicLinkBatch[]>([]);
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [batchLabel, setBatchLabel] = useState("Lote QR/NFC");
  const [batchCount, setBatchCount] = useState("1");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [audits, setAudits] = useState<Record<string, DynamicLinkAuditEvent[]>>({});
  const [isQuickSetupOpen, setIsQuickSetupOpen] = useState(false);
  const [isBulkSetupOpen, setIsBulkSetupOpen] = useState(false);

  async function load(cursor?: string, resetCursor = false) {
    setIsLoading(true);
    try {
      const [payload, batchPayload, profilePayload] = await Promise.all([listDynamicLinks({ query, status: status || undefined, tenantId: tenantFilter || undefined, batchId: batchFilter || undefined, sort, direction, pageSize, cursor }), listDynamicLinkBatches(), listBusinessProfiles({ pageSize: 100, status: "published", sort: "displayName", direction: "asc" })]);
      setUnits(payload.units); setBatches(batchPayload.batches); setProfiles(profilePayload.profiles); setTotalCount(payload.totalCount); setNextCursor(payload.pageInfo.nextCursor);
      if (resetCursor) setCursorStack([]);
      setError("");
    } catch (loadError) {
      setError(formatError(loadError, "No se pudo cargar el inventario."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void load(undefined, true); }, [query, status, tenantFilter, batchFilter, sort, direction, pageSize]);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("session");
    if (!sessionId) return;
    const storageKey = `nfc-handoff:${sessionId}`;
    const token = sessionStorage.getItem(storageKey);
    if (!token) return;
    const reportedUid = window.prompt("Si confirmaste la escritura, introduce opcionalmente el UID leído del chip:") || undefined;
    void consumeNfcHandoff(sessionId, token, reportedUid)
      .then(() => { sessionStorage.removeItem(storageKey); window.history.replaceState({}, "", window.location.pathname); setMessage("Escritura NFC reportada. Verifica físicamente el chip antes de registrar el hito."); })
      .catch((consumeError) => setError(formatError(consumeError, "No se pudo confirmar un retorno NFC legado.")));
  }, []);

  async function createBatch() {
    const count = Number(batchCount);
    if (!batchLabel.trim() || !Number.isInteger(count) || count < 1 || count > 500) {
      setError("Indica una etiqueta y entre 1 y 500 unidades.");
      return;
    }
    setIsSaving(true); setError("");
    try {
      await createDynamicLinkBatch({ requestId: crypto.randomUUID(), label: batchLabel.trim(), count });
      setMessage(`${count} unidad${count === 1 ? "" : "es"} creada${count === 1 ? "" : "s"}.`);
      await load(undefined, true);
    } catch (createError) {
      setError(formatError(createError, "No se pudo crear el lote."));
    } finally { setIsSaving(false); }
  }

  async function save(unit: DynamicLinkUnit, patch: Parameters<typeof updateDynamicLink>[1]) {
    setIsSaving(true); setError("");
    try {
      const result = await updateDynamicLink(unit.id, { ...patch, revision: unit.revision });
      replaceUnit(result.unit);
      setMessage("Unidad actualizada.");
    } catch (saveError) { setError(formatError(saveError, "No se pudo actualizar la unidad.")); }
    finally { setIsSaving(false); }
  }

  async function action(unit: DynamicLinkUnit, actionName: Parameters<typeof runDynamicLinkAction>[1], nfcUid?: string) {
    if (actionName === "archive" && !window.confirm(`Archivar ${unit.publicCode}? Esta acción no se puede revertir.`)) return;
    if (actionName === "activate" && (!unit.tenantId || !unit.locationId || !unit.nfcVerifiedAt) && !window.confirm("Esta unidad no tiene negocio/sede o verificación NFC completa. Puede activarse, pero confirma que el material físico corresponde al código.")) return;
    setIsSaving(true); setError("");
    try {
      const result = await runDynamicLinkAction(unit.id, actionName, { revision: unit.revision, nfcUid });
      replaceUnit(result.unit);
      setMessage("Hito registrado.");
    } catch (actionError) { setError(formatError(actionError, "No se pudo registrar la acción.")); }
    finally { setIsSaving(false); }
  }

  function replaceUnit(next: DynamicLinkUnit) {
    setUnits((current) => {
      const index = current.findIndex((unit) => unit.id === next.id);
      if (index < 0) return [next, ...current];
      return current.map((unit) => unit.id === next.id ? next : unit);
    });
  }

  async function refreshForEdit(unit: DynamicLinkUnit) {
    const result = await getDynamicLinkById(unit.id);
    replaceUnit(result.unit);
    return result.unit;
  }

  async function goNext() {
    if (!nextCursor) return;
    setCursorStack((current) => [...current, nextCursor]);
    await load(nextCursor);
  }

  async function goPrevious() {
    if (!cursorStack.length) return;
    const previous = cursorStack.slice(0, -1);
    setCursorStack(previous);
    await load(previous.at(-1));
  }

  async function downloadQr(unit: DynamicLinkUnit, format: "svg" | "png") {
    const content = format === "svg"
      ? await QRCode.toString(unit.publicUrl, qrSvgOptions())
      : await QRCode.toDataURL(unit.publicUrl, qrPngOptions());
    const blob = format === "svg"
      ? new Blob([content], { type: "image/svg+xml;charset=utf-8" })
      : await (await fetch(content)).blob();
    downloadBlob(blob, `${unit.publicCode}.${format}`);
  }

  async function downloadBatch() {
    const csv = ["code,url,label,status,nfc_uid", ...units.map((unit) => [unit.publicCode, unit.publicUrl, unit.label, unit.status, unit.nfcUid ?? ""].map(csvCell).join(","))].join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "dynamic-links-manifest.csv");
    for (const unit of units) {
      const svg = await QRCode.toString(unit.publicUrl, qrSvgOptions());
      downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${unit.publicCode}.svg`);
    }
    setMessage(`Se descargaron el manifiesto y ${units.length} SVG de esta página. Revisa las descargas del navegador.`);
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setMessage("URL copiada.");
  }

  async function showAudit(unit: DynamicLinkUnit) {
    try {
      const result = await getDynamicLinkAudit(unit.id);
      setAudits((current) => ({ ...current, [unit.id]: result.events }));
    } catch (auditError) { setError(formatError(auditError, "No se pudo cargar el historial.")); }
  }

  return (
    <section className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-[rgba(118,93,71,0.12)] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Inventario físico</p><h2 className="mt-2 text-2xl font-extrabold text-[var(--text-strong)]">Enlaces QR y NFC</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-soft)]">El QR y el NFC siempre contienen la URL permanente de ParaHoy. Cambia el destino aquí sin reimprimir ni reprogramar.</p></div>
        <div className="flex flex-wrap gap-2"><button className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-4 text-sm font-semibold text-white" onClick={() => setIsQuickSetupOpen(true)} type="button"><ScanLine size={16} />Configuración rápida</button><button className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[rgba(118,93,71,0.12)] px-4 text-sm font-semibold text-[var(--text-soft)]" onClick={() => setIsBulkSetupOpen(true)} type="button"><QrCode size={16} />Configurar varios</button><button className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[rgba(118,93,71,0.12)] px-4 text-sm font-semibold text-[var(--text-soft)]" disabled={isLoading} onClick={() => void load(cursorStack.at(-1))} type="button"><RefreshCw size={16} />Actualizar</button></div>
      </div>

      <div className="mt-5 grid gap-3 rounded-[22px] border border-[rgba(118,93,71,0.1)] bg-[var(--surface-base)] p-4 md:grid-cols-[1fr_130px_auto]">
        <label><span className="mb-2 block text-xs font-bold text-[var(--text-soft)]">Etiqueta de lote</span><input className="h-11 w-full rounded-xl border border-[rgba(118,93,71,0.14)] bg-white px-3 text-sm" onChange={(event) => setBatchLabel(event.target.value)} value={batchLabel} /></label>
        <label><span className="mb-2 block text-xs font-bold text-[var(--text-soft)]">Cantidad (máx. 500)</span><input className="h-11 w-full rounded-xl border border-[rgba(118,93,71,0.14)] bg-white px-3 text-sm" min="1" max="500" onChange={(event) => setBatchCount(event.target.value)} type="number" value={batchCount} /></label>
        <button className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--text-strong)] px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={isSaving} onClick={() => void createBatch()} type="button">{isSaving ? <Loader2 className="animate-spin" size={16} /> : <QrCode size={16} />}Crear unidades</button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <input className="h-11 min-w-64 flex-1 rounded-xl border border-[rgba(118,93,71,0.14)] bg-white px-3 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar código, etiqueta o sede" value={query} />
        <select className="h-11 rounded-xl border border-[rgba(118,93,71,0.14)] bg-white px-3 text-sm" onChange={(event) => setStatus(event.target.value as DynamicLinkStatus | "")} value={status}><option value="">Todos los estados</option><option value="available">Disponible</option><option value="active">Activo</option><option value="suspended">Suspendido</option><option value="archived">Archivado</option></select>
        <select className="h-11 max-w-56 rounded-xl border border-[rgba(118,93,71,0.14)] bg-white px-3 text-sm" onChange={(event) => setTenantFilter(event.target.value)} value={tenantFilter}><option value="">Todos los negocios</option>{restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}</select>
        <select className="h-11 max-w-56 rounded-xl border border-[rgba(118,93,71,0.14)] bg-white px-3 text-sm" onChange={(event) => setBatchFilter(event.target.value)} value={batchFilter}><option value="">Todos los lotes</option>{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.label}</option>)}</select>
        <select aria-label="Orden" className="h-11 rounded-xl border border-[rgba(118,93,71,0.14)] bg-white px-3 text-sm" onChange={(event) => setSort(event.target.value as DynamicLinkSortField)} value={sort}><option value="updatedAt">Actualización</option><option value="createdAt">Creación</option><option value="code">Código</option><option value="label">Etiqueta</option><option value="status">Estado</option></select>
        <select aria-label="Dirección de orden" className="h-11 rounded-xl border border-[rgba(118,93,71,0.14)] bg-white px-3 text-sm" onChange={(event) => setDirection(event.target.value as DynamicLinkSortDirection)} value={direction}><option value="desc">Descendente</option><option value="asc">Ascendente</option></select>
        <select aria-label="Unidades por página" className="h-11 rounded-xl border border-[rgba(118,93,71,0.14)] bg-white px-3 text-sm" onChange={(event) => setPageSize(Number(event.target.value) as 25 | 50 | 100)} value={pageSize}><option value="25">25</option><option value="50">50</option><option value="100">100</option></select>
        <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[rgba(118,93,71,0.14)] px-4 text-sm font-semibold" disabled={!units.length} onClick={() => void downloadBatch()} type="button"><Download size={16} />SVG + CSV página</button>
      </div>
      {(error || message) && <p className={`mt-4 rounded-xl px-3 py-2 text-sm font-semibold ${error ? "bg-[rgba(190,110,95,0.12)] text-[#9a4b43]" : "bg-[rgba(79,122,97,0.1)] text-[var(--success)]"}`}>{error || message}</p>}

      {isLoading ? <div className="grid min-h-52 place-items-center"><Loader2 className="animate-spin" size={24} /></div> : <div className="mt-5 space-y-3">{units.map((unit) => <UnitCard key={unit.id} unit={unit} profiles={profiles} restaurants={restaurants} audit={audits[unit.id]} onAction={action} onAudit={showAudit} onCopy={copy} onDownload={downloadQr} onEdit={refreshForEdit} onSave={save} />)}{units.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-[var(--text-soft)]">No hay unidades para este filtro.</p>}</div>}
      <nav aria-label="Paginación del inventario" className="mt-5 flex items-center justify-between gap-3 text-sm"><span>{totalCount} unidad{totalCount === 1 ? "" : "es"} encontradas</span><div className="flex gap-2"><button className="rounded-lg border px-3 py-2 disabled:opacity-50" disabled={!cursorStack.length || isLoading} onClick={() => void goPrevious()} type="button">Anterior</button><button className="rounded-lg border px-3 py-2 disabled:opacity-50" disabled={!nextCursor || isLoading} onClick={() => void goNext()} type="button">Siguiente</button></div></nav>
      <button aria-label="Abrir configuración rápida" className="fixed bottom-5 right-5 z-30 inline-flex h-14 items-center gap-2 rounded-full bg-[var(--text-strong)] px-5 text-sm font-bold text-white shadow-lg sm:hidden" onClick={() => setIsQuickSetupOpen(true)} type="button"><ScanLine size={18} />Configurar QR</button>
      {isQuickSetupOpen && <QuickDynamicLinkSetup restaurants={restaurants} profiles={profiles} onClose={() => setIsQuickSetupOpen(false)} onUpdated={replaceUnit} />}
      {isBulkSetupOpen && <BulkDynamicLinkSetup profiles={profiles} onClose={() => setIsBulkSetupOpen(false)} onUpdated={replaceUnit} />}
    </section>
  );
}

function UnitCard({ unit, profiles, restaurants, audit, onAction, onAudit, onCopy, onDownload, onEdit, onSave }: { unit: DynamicLinkUnit; profiles: BusinessProfile[]; restaurants: AdminRestaurant[]; audit?: DynamicLinkAuditEvent[]; onAction: (unit: DynamicLinkUnit, action: Parameters<typeof runDynamicLinkAction>[1], nfcUid?: string) => Promise<void>; onAudit: (unit: DynamicLinkUnit) => Promise<void>; onCopy: (value: string) => Promise<void>; onDownload: (unit: DynamicLinkUnit, format: "svg" | "png") => Promise<void>; onEdit: (unit: DynamicLinkUnit) => Promise<DynamicLinkUnit>; onSave: (unit: DynamicLinkUnit, patch: Parameters<typeof updateDynamicLink>[1]) => Promise<void> }) {
  const [destinationType, setDestinationType] = useState<DynamicLinkDestinationType>(unit.destinationType ?? "website");
  const [destinationUrl, setDestinationUrl] = useState(unit.destinationUrl ?? "");
  const [profileId, setProfileId] = useState(unit.profileId ?? "");
  const [label, setLabel] = useState(unit.label);
  const [tenantId, setTenantId] = useState(unit.tenantId ?? "");
  const [nfcUid, setNfcUid] = useState(unit.nfcUid ?? "");
  const [isEditing, setIsEditing] = useState(unit.status !== "active");
  const [editingUnit, setEditingUnit] = useState(unit);
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === tenantId);
  useEffect(() => {
    if (!isEditing) {
      setEditingUnit(unit); setLabel(unit.label); setTenantId(unit.tenantId ?? ""); setDestinationType(unit.destinationType ?? "website"); setDestinationUrl(unit.destinationUrl ?? ""); setProfileId(unit.profileId ?? ""); setNfcUid(unit.nfcUid ?? "");
    }
  }, [isEditing, unit]);
  const shownUnit = isEditing ? editingUnit : unit;
  async function beginEdit() {
    const fresh = await onEdit(unit);
    setEditingUnit(fresh); setLabel(fresh.label); setTenantId(fresh.tenantId ?? ""); setDestinationType(fresh.destinationType ?? "website"); setDestinationUrl(fresh.destinationUrl ?? ""); setProfileId(fresh.profileId ?? ""); setNfcUid(fresh.nfcUid ?? ""); setIsEditing(true);
  }
  async function confirmSave() {
    const destinationChanged = destinationUrl.trim() !== (editingUnit.destinationUrl ?? "") || destinationType !== (editingUnit.destinationType ?? "website") || tenantId !== (editingUnit.tenantId ?? "");
    if (destinationChanged && !window.confirm(`Destino público actual: ${editingUnit.destinationUrl ?? "sin destino"}\nNuevo destino: ${destinationUrl.trim() || "sin destino"}\n\n¿Confirmas este cambio?`)) return;
    await onSave(editingUnit, { revision: editingUnit.revision, label, tenantId: tenantId || null, locationId: selectedRestaurant?.location?.id ?? null, locationLabelSnapshot: selectedRestaurant?.location?.name ?? null, profileId: destinationType === "profile" ? profileId : null, destinationType: destinationType === "profile" ? "profile" : destinationUrl.trim() ? destinationType : null, destinationUrl: destinationType === "profile" ? null : destinationUrl.trim() || null });
    setIsEditing(false);
  }
  return <article className={`rounded-[20px] border bg-white p-4 ${unit.status === "active" ? "border-[rgba(79,122,97,0.65)] bg-[rgba(79,122,97,0.05)]" : "border-[rgba(118,93,71,0.12)]"}`}>
    <div className="flex flex-col justify-between gap-3 lg:flex-row"><div><div className="flex flex-wrap items-center gap-2"><code className="rounded-lg bg-[var(--surface-base)] px-2 py-1 text-sm font-bold">{unit.publicCode}</code><StatusBadge status={unit.status} /></div><p className="mt-2 text-sm text-[var(--text-soft)]">{unit.publicUrl}</p></div><div className="flex flex-wrap gap-2"><button className="grid h-9 w-9 place-items-center rounded-lg border" onClick={() => void onCopy(unit.publicUrl)} title="Copiar URL" type="button"><Copy size={16} /></button><button className="grid h-9 w-9 place-items-center rounded-lg border" onClick={() => void onDownload(unit, "svg")} title="Descargar SVG" type="button"><Download size={16} /></button><button className="grid h-9 w-9 place-items-center rounded-lg border" onClick={() => void onDownload(unit, "png")} title="Descargar PNG" type="button"><QrCode size={16} /></button><a className="grid h-9 w-9 place-items-center rounded-lg border" href={unit.publicUrl} rel="noreferrer" target="_blank" title="Abrir"><ExternalLink size={16} /></a></div></div>
    {unit.status === "active" && !isEditing && <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-[rgba(79,122,97,0.16)] px-2 py-1 text-xs font-bold text-[var(--success)]"><Check size={13} />Activo y protegido para editar</p>}
    <div className="mt-4 grid gap-3 lg:grid-cols-2"><label className="text-xs font-bold text-[var(--text-soft)]">Etiqueta<input className="mt-1 h-10 w-full rounded-lg border px-3 text-sm disabled:bg-[var(--surface-base)]" disabled={!isEditing} onChange={(event) => setLabel(event.target.value)} value={label} /></label><label className="text-xs font-bold text-[var(--text-soft)]">Negocio<select className="mt-1 h-10 w-full rounded-lg border px-3 text-sm disabled:bg-[var(--surface-base)]" disabled={!isEditing} onChange={(event) => setTenantId(event.target.value)} value={tenantId}><option value="">Sin asignar</option>{restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}</select></label><label className="text-xs font-bold text-[var(--text-soft)]">Tipo de destino<select className="mt-1 h-10 w-full rounded-lg border px-3 text-sm disabled:bg-[var(--surface-base)]" disabled={!isEditing} onChange={(event) => setDestinationType(event.target.value as DynamicLinkDestinationType)} value={destinationType}>{destinationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="text-xs font-bold text-[var(--text-soft)]">URL destino<input className="mt-1 h-10 w-full rounded-lg border px-3 text-sm disabled:bg-[var(--surface-base)]" disabled={!isEditing} onChange={(event) => setDestinationUrl(event.target.value)} placeholder="https://…" value={destinationUrl} /></label></div>
    <div className="mt-3 flex flex-wrap gap-2">{!isEditing && <button className="rounded-lg border border-[rgba(79,122,97,0.6)] px-3 py-2 text-xs font-bold" onClick={() => void beginEdit()} type="button">Editar configuración</button>}{isEditing && <><button className="rounded-lg bg-[var(--text-strong)] px-3 py-2 text-xs font-bold text-white" onClick={() => void confirmSave()} type="button">Guardar destino</button><button className="rounded-lg border px-3 py-2 text-xs font-bold" onClick={() => setIsEditing(false)} type="button">Cancelar</button></>}{unit.status !== "active" && unit.status !== "archived" && <button className="rounded-lg border px-3 py-2 text-xs font-bold" onClick={() => void onAction(shownUnit, "activate")} type="button"><Check className="mr-1 inline" size={14} />Activar</button>}{unit.status === "active" && <button className="rounded-lg border px-3 py-2 text-xs font-bold" onClick={() => void onAction(unit, "suspend")} type="button"><ShieldBan className="mr-1 inline" size={14} />Suspender</button>}{unit.status !== "archived" && <button className="rounded-lg border px-3 py-2 text-xs font-bold text-[#9a4b43]" onClick={() => void onAction(unit, "archive")} type="button"><Archive className="mr-1 inline" size={14} />Archivar</button>}<button className="rounded-lg border px-3 py-2 text-xs font-bold" onClick={() => void onAction(unit, "mark-qr-printed")} type="button">QR impreso</button><button className="rounded-lg border px-3 py-2 text-xs font-bold" onClick={() => void onAction(unit, "mark-nfc-programmed", nfcUid)} type="button"><Radio className="mr-1 inline" size={14} />NFC programado</button><button className="rounded-lg border px-3 py-2 text-xs font-bold" onClick={() => void onAction(unit, "mark-nfc-verified")} type="button">NFC verificado</button><button className="rounded-lg border px-3 py-2 text-xs font-bold text-[#9a4b43]" onClick={() => { if (window.confirm("Este registro indica que el chip se bloqueó físicamente. El dashboard no puede bloquearlo ni revertirlo. ¿Confirmas que ya ocurrió?")) void onAction(unit, "mark-nfc-locked"); }} type="button"><Lock className="mr-1 inline" size={14} />Registrar bloqueo físico</button></div>
    {unit.nfcLockedAt && <p className="mt-3 text-xs font-bold text-[#9a4b43]">NFC bloqueado físicamente — {new Date(unit.nfcLockedAt).toLocaleString("es-CO")}</p>}<label className="mt-3 block text-xs font-bold text-[var(--text-soft)]">UID NFC opcional<input className="mt-1 h-9 w-full rounded-lg border px-3 text-sm" disabled={!isEditing} onChange={(event) => setNfcUid(event.target.value)} value={nfcUid} /></label><button className="mt-3 text-xs font-bold text-[var(--text-soft)] underline" onClick={() => void onAudit(unit)} type="button">Ver historial</button>{audit && <ol className="mt-2 space-y-1 text-xs text-[var(--text-soft)]">{audit.map((event) => <li key={event.id}>{new Date(event.createdAt).toLocaleString("es-CO")} — {event.eventType}</li>)}</ol>}
    {destinationType === "profile" && <label className="mt-3 block text-xs font-bold text-[var(--text-soft)]">Perfil publicado<select className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" disabled={!isEditing} onChange={(event) => setProfileId(event.target.value)} value={profileId}><option value="">Selecciona un perfil</option>{profiles.filter((profile) => profile.status === "published").map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName} · /p/{profile.slug}</option>)}</select></label>}
  </article>;
}

function StatusBadge({ status }: { status: DynamicLinkStatus }) { return <span className="rounded-full bg-[var(--surface-base)] px-2 py-1 text-xs font-bold text-[var(--text-soft)]">{status}</span>; }
function qrSvgOptions() { return { type: "svg" as const, errorCorrectionLevel: "M" as const, margin: 4, width: 1181, color: { dark: "#000000", light: "#ffffff" } }; }
function qrPngOptions() { return { errorCorrectionLevel: "M" as const, margin: 4, width: 1181, color: { dark: "#000000", light: "#ffffff" } }; }
function downloadBlob(blob: Blob, fileName: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1_000); }
function csvCell(value: string) { return `"${value.replaceAll('"', '""')}"`; }
function formatError(error: unknown, fallback: string) { return error instanceof DashboardApiError ? (error.backendError ?? error.message) : error instanceof Error ? error.message : fallback; }
