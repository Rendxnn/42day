import { DynamicLinkValidationError, parseDynamicLinkReference } from "@42day/core";
import { Check, Clipboard, ExternalLink, Loader2, QrCode, ScanLine, X } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  DashboardApiError,
  getDynamicLinkByCode,
  quickConfigureDynamicLink,
  resolveGoogleReviewDestination,
} from "../../api";
import type { AdminRestaurant, DynamicLinkUnit } from "../../api";
import { DynamicLinkQrScanner } from "./DynamicLinkQrScanner";
import { formatDynamicLinkLookupFailure } from "./dynamicLinkQuickSetupErrors";
import {
  beginGoogleReviewPreparation,
  confirmGoogleReviewPreparation,
  destinationForQuickSetupSave,
  failGoogleReviewPreparation,
  hasPotentialGoogleReviewUrl,
  markGoogleReviewPreviewOpened,
  resolveGoogleReviewPreparation,
  type GoogleReviewPreparationState,
} from "./googleReviewPreparation";
import { formatGoogleReviewResolutionFailure } from "./googleReviewResolutionErrors";

type AssociationChoice = "preserve" | "clear" | string;
type Phase = "scan" | "manual" | "resolving" | "form" | "confirm" | "saving" | "success" | "archived";

type Props = {
  restaurants: AdminRestaurant[];
  onClose: () => void;
  onUpdated: (unit: DynamicLinkUnit) => void;
};

const permanentBaseUrl = "https://go.thaledon.com";
const idleGooglePreparation: GoogleReviewPreparationState = { status: "idle" };

export function QuickDynamicLinkSetup({ restaurants, onClose, onUpdated }: Props) {
  const [phase, setPhase] = useState<Phase>("scan");
  const [unit, setUnit] = useState<DynamicLinkUnit>();
  const [reference, setReference] = useState("");
  const [label, setLabel] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [association, setAssociation] = useState<AssociationChoice>("preserve");
  const [googlePreparation, setGooglePreparation] = useState<GoogleReviewPreparationState>(idleGooglePreparation);
  const [error, setError] = useState("");
  const [copyFailed, setCopyFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reviewCopied, setReviewCopied] = useState(false);
  const [reviewCopyFailed, setReviewCopyFailed] = useState(false);
  const googlePreparationAttempt = useRef(0);

  const resolveReference = useCallback(async (value: string) => {
    googlePreparationAttempt.current += 1;
    setReference(value.slice(0, 500));
    setPhase("resolving");
    setError("");
    try {
      const code = parseDynamicLinkReference(value, permanentBaseUrl);
      const result = await getDynamicLinkByCode(code);
      setUnit(result.unit);
      setLabel(result.unit.label);
      setDestinationUrl(result.unit.destinationUrl ?? "");
      setAssociation("preserve");
      setGooglePreparation(idleGooglePreparation);
      setCopyFailed(false);
      setCopied(false);
      setReviewCopied(false);
      setReviewCopyFailed(false);
      setPhase(result.unit.status === "archived" ? "archived" : "form");
    } catch (resolveError) {
      setError(formatResolveError(resolveError));
      setPhase("manual");
    }
  }, []);

  async function prepareGoogleReview() {
    const input = destinationUrl.trim();
    if (!hasPotentialGoogleReviewUrl(input)) {
      setError("Pega un enlace HTTPS de Google Maps o un enlace directo de reseña.");
      return;
    }

    const resolving = beginGoogleReviewPreparation(input);
    const attempt = googlePreparationAttempt.current + 1;
    googlePreparationAttempt.current = attempt;
    setGooglePreparation(resolving);
    setReviewCopied(false);
    setReviewCopyFailed(false);
    setError("");
    try {
      const result = await resolveGoogleReviewDestination({ destinationUrl: input });
      if (googlePreparationAttempt.current !== attempt) return;
      setGooglePreparation(resolveGoogleReviewPreparation(resolving, result.resolution));
    } catch (resolutionError) {
      if (googlePreparationAttempt.current !== attempt) return;
      const errorCode = resolutionError instanceof DashboardApiError
        ? resolutionError.backendError ?? "google_review_resolution_failed"
        : "google_review_network_failed";
      setGooglePreparation(failGoogleReviewPreparation(input, errorCode));
      setError(formatGoogleReviewResolutionFailure(resolutionError));
    }
  }

  function updateDestination(value: string) {
    googlePreparationAttempt.current += 1;
    setDestinationUrl(value);
    setGooglePreparation(idleGooglePreparation);
    setReviewCopied(false);
    setReviewCopyFailed(false);
    setError("");
  }

  function requestSave() {
    if (!unit) return;
    if (!label.trim()) {
      setError("La etiqueta o nombre del lugar es obligatoria.");
      return;
    }
    try {
      const url = new URL(destinationUrl.trim());
      if (url.protocol !== "https:") throw new Error("invalid");
    } catch {
      setError("Usa una URL HTTPS válida para el destino.");
      return;
    }

    const destination = destinationForQuickSetupSave(destinationUrl, googlePreparation, unit.destinationUrl);
    if (!destination) {
      setError("Abre el enlace preparado y confirma que Google muestra el negocio correcto antes de guardar.");
      return;
    }

    setError("");
    if (unit.status === "active" && hasDestinationChanged(unit.destinationUrl, destination)) {
      setPhase("confirm");
      return;
    }
    void save(destination);
  }

  async function save(destinationOverride?: string) {
    if (!unit) return;
    const destination = destinationOverride
      ?? destinationForQuickSetupSave(destinationUrl, googlePreparation, unit.destinationUrl);
    if (!destination) {
      setError("Vuelve a preparar y confirmar el enlace de reseña antes de guardar.");
      setPhase("form");
      return;
    }

    setPhase("saving");
    setError("");
    try {
      const result = await quickConfigureDynamicLink(unit.id, {
        revision: unit.revision,
        label: label.trim(),
        destinationUrl: destination,
        ...(association === "preserve" ? {} : { tenantId: association === "clear" ? null : association }),
      });
      setUnit(result.unit);
      onUpdated(result.unit);
      setCopyFailed(false);
      setCopied(false);
      setPhase("success");
    } catch (saveError) {
      setError(formatError(saveError));
      setPhase("form");
    }
  }

  async function copyNfcLink() {
    if (!unit) return;
    try {
      await navigator.clipboard.writeText(unit.publicUrl);
      setCopyFailed(false);
      setCopied(true);
    } catch {
      setCopyFailed(true);
      setCopied(false);
    }
  }

  async function copyReviewLink(reviewUrl: string) {
    try {
      await navigator.clipboard.writeText(reviewUrl);
      setReviewCopyFailed(false);
      setReviewCopied(true);
    } catch {
      setReviewCopyFailed(true);
      setReviewCopied(false);
    }
  }

  function scanAnother() {
    googlePreparationAttempt.current += 1;
    setUnit(undefined);
    setReference("");
    setLabel("");
    setDestinationUrl("");
    setAssociation("preserve");
    setGooglePreparation(idleGooglePreparation);
    setError("");
    setCopyFailed(false);
    setCopied(false);
    setReviewCopied(false);
    setReviewCopyFailed(false);
    setPhase("scan");
  }

  const googleIsResolving = googlePreparation.status === "resolving";
  const isWorking = phase === "resolving" || phase === "saving" || googleIsResolving;
  const isFormLocked = isWorking || phase === "confirm";
  const requiresGooglePreparation = Boolean(
    unit
    && hasPotentialGoogleReviewUrl(destinationUrl)
    && hasDestinationChanged(unit.destinationUrl, destinationUrl),
  );
  const destinationForConfirmation = unit
    ? destinationForQuickSetupSave(destinationUrl, googlePreparation, unit.destinationUrl)
    : undefined;

  return (
    <div aria-modal="true" className="fixed inset-0 z-50 overflow-y-auto bg-[var(--surface-base)]" role="dialog">
      <div className="mx-auto min-h-full w-full max-w-xl px-4 pb-28 pt-5 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Inventario físico</p>
            <h2 className="mt-1 text-2xl font-extrabold text-[var(--text-strong)]">Configuración rápida</h2>
          </div>
          <button aria-label="Cerrar configuración rápida" className="grid h-11 w-11 place-items-center rounded-xl border border-[rgba(118,93,71,0.14)]" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">Escanea la unidad que tienes en la mano. El lector no abre el enlace ni guarda imágenes de cámara.</p>

        {phase === "scan" && (
          <>
            <div className="mt-6">
              <DynamicLinkQrScanner onDetected={(value) => void resolveReference(value)} onUnavailable={() => setPhase("manual")} />
            </div>
            <button className="mt-4 w-full rounded-xl border border-[rgba(118,93,71,0.14)] px-4 py-3 text-sm font-bold" onClick={() => setPhase("manual")} type="button">
              Pegar enlace o escribir código
            </button>
          </>
        )}

        {(phase === "manual" || phase === "resolving") && (
          <div className="mt-6 rounded-2xl border border-[rgba(118,93,71,0.14)] bg-white p-4">
            <label className="block text-sm font-bold text-[var(--text-strong)]">
              Enlace permanente o código
              <input autoCapitalize="characters" className="mt-2 h-12 w-full rounded-xl border border-[rgba(118,93,71,0.16)] px-3 font-mono text-sm" disabled={phase === "resolving"} onChange={(event) => setReference(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void resolveReference(reference); }} placeholder="go.thaledon.com/r/ABC…" value={reference} />
            </label>
            <button className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--text-strong)] px-4 text-sm font-bold text-white disabled:opacity-60" disabled={!reference.trim() || phase === "resolving"} onClick={() => void resolveReference(reference)} type="button">
              {phase === "resolving" ? <Loader2 className="animate-spin" size={17} /> : <ScanLine size={17} />}
              Buscar unidad
            </button>
            <button className="mt-3 w-full text-sm font-bold text-[var(--text-soft)] underline" onClick={() => setPhase("scan")} type="button">Usar cámara</button>
          </div>
        )}

        {phase === "archived" && (
          <StateCard>
            <p className="font-bold text-[var(--text-strong)]">{unit?.publicCode} está archivada.</p>
            <p className="mt-2 text-sm text-[var(--text-soft)]">Las unidades archivadas no se pueden cambiar desde configuración rápida.</p>
            <button className="mt-5 w-full rounded-xl bg-[var(--text-strong)] px-4 py-3 text-sm font-bold text-white" onClick={scanAnother} type="button">Escanear otra</button>
          </StateCard>
        )}

        {(phase === "form" || phase === "saving" || phase === "confirm") && unit && (
          <div className="mt-6 space-y-4">
            <UnitSummary restaurants={restaurants} unit={unit} />
            <label className="block text-sm font-bold text-[var(--text-strong)]">
              Etiqueta o nombre del lugar
              <input className="mt-2 h-12 w-full rounded-xl border border-[rgba(118,93,71,0.16)] px-3 text-base font-normal" disabled={isFormLocked} onChange={(event) => setLabel(event.target.value)} value={label} />
            </label>
            <label className="block text-sm font-bold text-[var(--text-strong)]">
              URL destino
              <input className="mt-2 h-12 w-full rounded-xl border border-[rgba(118,93,71,0.16)] px-3 text-base font-normal" disabled={isFormLocked} inputMode="url" onChange={(event) => updateDestination(event.target.value)} placeholder="https://…" value={destinationUrl} />
            </label>

            {requiresGooglePreparation && (
              <GoogleReviewPreparationCard
                copyFailed={reviewCopyFailed}
                copied={reviewCopied}
                onConfirm={() => {
                  setGooglePreparation((current) => confirmGoogleReviewPreparation(current));
                  setError("");
                }}
                onCopy={(reviewUrl) => void copyReviewLink(reviewUrl)}
                onPrepare={() => void prepareGoogleReview()}
                onPreview={() => setGooglePreparation((current) => markGoogleReviewPreviewOpened(current))}
                onReject={() => {
                  setGooglePreparation(idleGooglePreparation);
                  setError("Pega nuevamente la ficha correcta o un enlace directo de reseña.");
                }}
                state={googlePreparation}
              />
            )}

            <label className="block text-sm font-bold text-[var(--text-strong)]">
              Negocio <span className="font-normal text-[var(--text-soft)]">(opcional)</span>
              <select className="mt-2 h-12 w-full rounded-xl border border-[rgba(118,93,71,0.16)] bg-white px-3 text-base font-normal" disabled={isFormLocked} onChange={(event) => setAssociation(event.target.value)} value={association}>
                <option value="preserve">Mantener: {restaurants.find((restaurant) => restaurant.id === unit.tenantId)?.name ?? "sin asignar"}</option>
                <option value="clear">Sin asignar</option>
                {restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}
              </select>
            </label>

            {phase === "confirm" && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm">
                <p className="font-bold">Vas a cambiar el destino de una unidad activa.</p>
                <p className="mt-2 break-all text-[var(--text-soft)]"><span className="font-semibold">Actual:</span> {unit.destinationUrl}</p>
                <p className="mt-2 break-all text-[var(--text-soft)]"><span className="font-semibold">Nuevo:</span> {destinationForConfirmation}</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button className="rounded-xl border px-3 py-3 font-bold" onClick={() => setPhase("form")} type="button">Cancelar</button>
                  <button className="rounded-xl bg-[var(--text-strong)] px-3 py-3 font-bold text-white" onClick={() => void save(destinationForConfirmation)} type="button">Confirmar</button>
                </div>
              </div>
            )}

            {phase !== "confirm" && (
              <button className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-[var(--text-strong)] px-4 py-3 text-base font-bold text-white disabled:opacity-60" disabled={isWorking} onClick={requestSave} type="button">
                {isWorking ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                Guardar y activar
              </button>
            )}
          </div>
        )}

        {phase === "success" && unit && (
          <StateCard>
            <div className="flex items-center gap-2 text-[var(--success)]"><Check size={21} /><p className="font-bold">Unidad activada y guardada.</p></div>
            <p className="mt-4 text-sm text-[var(--text-soft)]">Programa este mismo enlace en el chip NFC.</p>
            <code className="mt-3 block break-all rounded-xl bg-[var(--surface-base)] p-3 text-sm font-bold text-[var(--text-strong)]">{unit.publicUrl}</code>
            <button className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--text-strong)] px-4 text-sm font-bold text-white" onClick={() => void copyNfcLink()} type="button"><Clipboard size={17} />Copiar enlace para NFC</button>
            {copied && <p aria-live="polite" className="mt-3 text-sm font-semibold text-[var(--success)]">Enlace copiado para programar el NFC.</p>}
            {copyFailed && (
              <>
                <p className="mt-3 text-sm text-[#9a4b43]">No se pudo usar el portapapeles. Selecciona y copia el enlace manualmente.</p>
                <input aria-label="Enlace para NFC" className="mt-2 h-12 w-full rounded-xl border px-3 font-mono text-xs" readOnly value={unit.publicUrl} onFocus={(event) => event.currentTarget.select()} />
              </>
            )}
            <button className="mt-4 w-full rounded-xl border border-[rgba(118,93,71,0.14)] px-4 py-3 text-sm font-bold" onClick={scanAnother} type="button"><QrCode className="mr-2 inline" size={17} />Escanear otra</button>
          </StateCard>
        )}

        {error && <p aria-live="assertive" className="mt-5 rounded-xl bg-[rgba(190,110,95,0.12)] px-3 py-3 text-sm font-semibold text-[#9a4b43]">{error}</p>}
      </div>
    </div>
  );
}

function GoogleReviewPreparationCard({
  state,
  copied,
  copyFailed,
  onPrepare,
  onPreview,
  onConfirm,
  onReject,
  onCopy,
}: {
  state: GoogleReviewPreparationState;
  copied: boolean;
  copyFailed: boolean;
  onPrepare: () => void;
  onPreview: () => void;
  onConfirm: () => void;
  onReject: () => void;
  onCopy: (reviewUrl: string) => void;
}) {
  const result = state.status === "resolved" || state.status === "confirmed" ? state.resolution : undefined;
  return (
    <div className="rounded-2xl border border-[rgba(118,93,71,0.18)] bg-white p-4">
      <p className="font-bold text-[var(--text-strong)]">Enlace de Google Maps</p>
      <p className="mt-1 text-sm leading-5 text-[var(--text-soft)]">Prepara el enlace, ábrelo y confirma visualmente que Google muestra el negocio correcto.</p>

      {!result && (
        <button className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[rgba(118,93,71,0.22)] px-4 text-sm font-bold disabled:opacity-60" disabled={state.status === "resolving"} onClick={onPrepare} type="button">
          {state.status === "resolving" ? <Loader2 className="animate-spin" size={17} /> : <ExternalLink size={17} />}
          {state.status === "resolving" ? "Preparando…" : state.status === "failed" ? "Intentar nuevamente" : "Preparar enlace de reseña"}
        </button>
      )}

      {result && (
        <div className="mt-4">
          {result.candidateLabel && <p className="text-sm"><span className="font-semibold">Referencia detectada:</span> {result.candidateLabel}</p>}
          <p className="mt-2 text-xs text-[var(--text-soft)]">Esta referencia es orientativa; la ficha abierta es la que debes comprobar.</p>
          <input aria-label="Enlace de reseña preparado" className="mt-3 h-12 w-full rounded-xl border px-3 font-mono text-xs" readOnly value={result.reviewUrl} onFocus={(event) => event.currentTarget.select()} />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <a className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--text-strong)] px-3 text-center text-sm font-bold text-white" href={result.reviewUrl} onClick={onPreview} rel="noopener noreferrer" target="_blank"><ExternalLink size={17} />Probar enlace de reseña</a>
            <button className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold" onClick={() => onCopy(result.reviewUrl)} type="button"><Clipboard size={17} />Copiar enlace de prueba</button>
          </div>
          {copied && <p aria-live="polite" className="mt-2 text-sm font-semibold text-[var(--success)]">Enlace de prueba copiado.</p>}
          {copyFailed && <p aria-live="polite" className="mt-2 text-sm text-[#9a4b43]">No se pudo copiar automáticamente. Mantén presionado el enlace para copiarlo.</p>}

          {state.status === "resolved" && state.previewOpened && (
            <div className="mt-4 rounded-xl bg-[var(--surface-base)] p-3">
              <p className="text-sm font-bold">¿Google mostró el negocio correcto y permitió escribir una reseña?</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button className="rounded-xl border px-3 py-3 text-sm font-bold" onClick={onReject} type="button">No, usar otro</button>
                <button className="rounded-xl bg-[var(--success)] px-3 py-3 text-sm font-bold text-white" onClick={onConfirm} type="button">Sí, confirmar</button>
              </div>
            </div>
          )}
          {state.status === "confirmed" && <p aria-live="polite" className="mt-4 rounded-xl bg-[rgba(74,135,99,0.12)] p-3 text-sm font-bold text-[var(--success)]">Negocio confirmado. Ya puedes guardar y activar.</p>}
        </div>
      )}
    </div>
  );
}

function UnitSummary({ restaurants, unit }: { restaurants: AdminRestaurant[]; unit: DynamicLinkUnit }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="font-mono text-sm font-bold text-[var(--text-strong)]">{unit.publicCode}</p>
      <p className="mt-1 break-all text-xs text-[var(--text-soft)]">{unit.publicUrl}</p>
      <p className="mt-3 text-sm text-[var(--text-soft)]">
        Estado: <span className="font-bold text-[var(--text-strong)]">{unit.status}</span> · Negocio: <span className="font-bold text-[var(--text-strong)]">{restaurants.find((restaurant) => restaurant.id === unit.tenantId)?.name ?? "Sin asignar"}</span>
      </p>
    </div>
  );
}

function StateCard({ children }: { children: ReactNode }) {
  return <div className="mt-6 rounded-2xl border border-[rgba(118,93,71,0.14)] bg-white p-5">{children}</div>;
}

function hasDestinationChanged(current: string | undefined, next: string) {
  try {
    return new URL(current ?? "").toString() !== new URL(next.trim()).toString();
  } catch {
    return current?.trim() !== next.trim();
  }
}

function formatResolveError(error: unknown) {
  if (error instanceof DynamicLinkValidationError) return "El QR no contiene un código válido ni una URL propia de go.thaledon.com/r/CÓDIGO.";
  if (!(error instanceof DashboardApiError)) return "No fue posible consultar la unidad por un error de red. Inténtalo otra vez.";
  return formatDynamicLinkLookupFailure(error);
}

function formatError(error: unknown) {
  if (error instanceof DashboardApiError) {
    if (error.backendError === "dynamic_link_stale") return "Esta unidad cambió en otra sesión. Vuelve a escanearla antes de guardar.";
    if (error.backendError === "dynamic_link_archived") return "La unidad fue archivada y no puede modificarse.";
    if (error.backendError === "dynamic_link_google_review_resolution_required") return "Prepara y confirma el enlace de reseña de Google antes de guardar.";
    return "No se pudo guardar. Revisa la URL destino e inténtalo de nuevo.";
  }
  return "No se pudo guardar por un error de red. Inténtalo de nuevo.";
}
