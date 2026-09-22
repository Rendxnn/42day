import { Check, Loader2, ScanLine, X } from "lucide-react";
import { useState } from "react";
import {
  applyDynamicLinkBulkConfiguration,
  getDynamicLinkByCode,
  preflightDynamicLinkBulkConfiguration,
  type BusinessProfile,
  type DynamicLinkDestinationType,
  type DynamicLinkUnit,
} from "../../api";
import { DynamicLinkQrScanner } from "./DynamicLinkQrScanner";

type Props = { profiles: BusinessProfile[]; onClose: () => void; onUpdated: (unit: DynamicLinkUnit) => void };
type Preflight = Awaited<ReturnType<typeof preflightDynamicLinkBulkConfiguration>>;

const redirectTypes: Array<{ value: Exclude<DynamicLinkDestinationType, "profile">; label: string }> = [
  { value: "website", label: "Página web" },
  { value: "menu", label: "Carta" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
];

export function BulkDynamicLinkSetup({ profiles, onClose, onUpdated }: Props) {
  const [units, setUnits] = useState<DynamicLinkUnit[]>([]);
  const [manualCode, setManualCode] = useState("");
  const [targetMode, setTargetMode] = useState<"profile" | "redirect">("profile");
  const [profileId, setProfileId] = useState("");
  const [destinationType, setDestinationType] = useState<Exclude<DynamicLinkDestinationType, "profile">>("website");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [associationMode, setAssociationMode] = useState<"preserve" | "clear">("preserve");
  const [preflight, setPreflight] = useState<Preflight>();
  const [consent, setConsent] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function addCode(value: string) {
    const code = value.trim();
    if (!code || units.length >= 100) return;
    try {
      const result = await getDynamicLinkByCode(code);
      setUnits((current) => current.some((unit) => unit.id === result.unit.id) ? current : [...current, result.unit]);
      setManualCode(""); setError(""); setPreflight(undefined);
    } catch { setError("No se encontró una unidad válida para ese código."); }
  }

  function target() {
    return targetMode === "profile"
      ? { kind: "profile" as const, profileId }
      : { kind: "redirect" as const, destinationType, destinationUrl, associationMode };
  }

  async function runPreflight() {
    if (units.length < 2 || !profileId && targetMode === "profile" || !destinationUrl.trim() && targetMode === "redirect") {
      setError("Agrega entre 2 y 100 unidades y completa el destino."); return;
    }
    setWorking(true); setError("");
    try {
      const result = await preflightDynamicLinkBulkConfiguration({ units: units.map(({ id, revision }) => ({ id, revision })), target: target() });
      setPreflight(result); setConsent([]);
    } catch (preflightError) { setError(preflightError instanceof Error ? preflightError.message : "No se pudo preparar el lote."); }
    finally { setWorking(false); }
  }

  async function apply() {
    if (!preflight) return;
    if (preflight.excluded.length > 0) { setError("Quita las unidades excluidas y vuelve a ejecutar el preflight antes de aplicar."); return; }
    const protectedIds = preflight.protected.map((unit) => unit.id);
    if (protectedIds.some((id) => !consent.includes(id))) { setError("Confirma individualmente los QRs activos antes de aplicar."); return; }
    setWorking(true); setError("");
    try {
      const result = await applyDynamicLinkBulkConfiguration({ operationId: crypto.randomUUID(), units: units.map(({ id, revision }) => ({ id, revision })), target: target(), consentedActiveUnitIds: consent });
      setMessage(`Configuración aplicada a ${result.units.length} unidades.`);
      for (const item of result.units) {
        const refreshed = await getDynamicLinkByCode(item.publicCode);
        onUpdated(refreshed.unit);
      }
      setPreflight(undefined);
    } catch (applyError) { setError(applyError instanceof Error ? applyError.message : "No se pudo aplicar el lote; no se modificó ninguna unidad."); }
    finally { setWorking(false); }
  }

  return <div aria-modal="true" className="fixed inset-0 z-50 overflow-y-auto bg-[var(--surface-base)]" role="dialog">
    <div className="mx-auto min-h-full w-full max-w-2xl px-4 pb-24 pt-5 sm:px-6">
      <div className="flex items-center justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Inventario físico</p><h2 className="mt-1 text-2xl font-extrabold">Configurar varios QRs</h2></div><button aria-label="Cerrar" className="grid h-11 w-11 place-items-center rounded-xl border" onClick={onClose} type="button"><X size={20} /></button></div>
      <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">Escanea o agrega de 2 a 100 unidades. Los activos quedan protegidos y requieren confirmación individual.</p>
      <div className="mt-5 rounded-2xl border bg-white p-4"><DynamicLinkQrScanner onDetected={(value) => void addCode(value)} onUnavailable={() => undefined} /><div className="mt-3 flex gap-2"><input className="h-11 min-w-0 flex-1 rounded-xl border px-3 font-mono text-sm" onChange={(event) => setManualCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addCode(manualCode); }} placeholder="Código o URL permanente" value={manualCode} /><button className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--text-strong)] px-4 text-sm font-bold text-white" onClick={() => void addCode(manualCode)} type="button"><ScanLine size={16} />Agregar</button></div></div>
      <div className="mt-4 space-y-2">{units.map((unit) => <div className="flex items-center justify-between rounded-xl border bg-white p-3 text-sm" key={unit.id}><div><p className="font-mono font-bold">{unit.publicCode}</p><p className="text-xs text-[var(--text-soft)]">{unit.status} · rev. {unit.revision} · {unit.destinationUrl ?? "sin destino"}</p></div><button className="text-xs font-bold underline" onClick={() => { setUnits((current) => current.filter((candidate) => candidate.id !== unit.id)); setPreflight(undefined); }} type="button">Quitar</button></div>)}</div>
      <div className="mt-5 rounded-2xl border bg-white p-4"><p className="text-sm font-bold">Configuración común</p><div className="mt-3 grid grid-cols-2 gap-2"><button className={`rounded-xl border px-3 py-3 text-sm font-bold ${targetMode === "profile" ? "bg-[var(--text-strong)] text-white" : ""}`} onClick={() => setTargetMode("profile")} type="button">Perfil</button><button className={`rounded-xl border px-3 py-3 text-sm font-bold ${targetMode === "redirect" ? "bg-[var(--text-strong)] text-white" : ""}`} onClick={() => setTargetMode("redirect")} type="button">Redirección</button></div>{targetMode === "profile" ? <select className="mt-3 h-11 w-full rounded-xl border px-3 text-sm" onChange={(event) => setProfileId(event.target.value)} value={profileId}><option value="">Selecciona un perfil publicado</option>{profiles.filter((profile) => profile.status === "published").map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName} · /p/{profile.slug}</option>)}</select> : <><div className="mt-3 grid gap-3 sm:grid-cols-2"><select className="h-11 rounded-xl border px-3 text-sm" onChange={(event) => setDestinationType(event.target.value as typeof destinationType)} value={destinationType}>{redirectTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><select className="h-11 rounded-xl border px-3 text-sm" onChange={(event) => setAssociationMode(event.target.value as typeof associationMode)} value={associationMode}><option value="preserve">Conservar negocio</option><option value="clear">Limpiar negocio</option></select></div><input className="mt-3 h-11 w-full rounded-xl border px-3 text-sm" onChange={(event) => setDestinationUrl(event.target.value)} placeholder="https://…" value={destinationUrl} /></>}</div>
      <button className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold disabled:opacity-60" disabled={working || units.length < 2} onClick={() => void runPreflight()} type="button">{working ? <Loader2 className="animate-spin" size={17} /> : <Check size={17} />}Preparar cambios</button>
      {preflight && <div className="mt-4 space-y-3 rounded-2xl border bg-white p-4"><p className="font-bold">Preflight: {preflight.eligible.length} elegibles · {preflight.protected.length} activos protegidos · {preflight.excluded.length} excluidos</p>{preflight.protected.map((unit) => <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm" key={unit.id}><input checked={consent.includes(unit.id)} onChange={(event) => setConsent((current) => event.target.checked ? [...current, unit.id] : current.filter((id) => id !== unit.id))} type="checkbox" /><span><b>{unit.publicCode}</b><br />Activo: cambiará de <span className="break-all">{unit.destinationUrl ?? "sin destino"}</span>.</span></label>)}{preflight.excluded.map((item) => <p className="text-sm text-[#9a4b43]" key={item.id}>{item.publicCode ?? item.id}: {item.reason}</p>)}<button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--text-strong)] px-4 text-sm font-bold text-white disabled:opacity-60" disabled={working || preflight.excluded.length > 0 || preflight.eligible.length + preflight.protected.length < 2} onClick={() => void apply()} type="button">Aplicar todo-o-nada</button></div>}
      {(error || message) && <p aria-live="polite" className={`mt-4 rounded-xl px-3 py-3 text-sm font-semibold ${error ? "bg-[rgba(190,110,95,0.12)] text-[#9a4b43]" : "bg-[rgba(79,122,97,0.1)] text-[var(--success)]"}`}>{error || message}</p>}
    </div>
  </div>;
}
