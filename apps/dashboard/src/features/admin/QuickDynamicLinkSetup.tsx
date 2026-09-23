import { DynamicLinkValidationError, normalizeBusinessProfileLink, parseDynamicLinkReference } from "@42day/core";
import { BUSINESS_PROFILE_LIMITS } from "@42day/types";
import type { BusinessProfileLinkKind } from "@42day/types";
import { Check, Clipboard, ExternalLink, Loader2, QrCode, Radio, ScanLine, X } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  DashboardApiError,
  createNfcHandoff,
  getDynamicLinkByCode,
  quickConfigureDynamicLink,
  resolveGoogleReviewDestination,
} from "../../api";
import type { AdminRestaurant, BusinessProfile, DynamicLinkUnit } from "../../api";
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
import { formatBusinessProfileError } from "./business-profile-errors";

type AssociationChoice = "preserve" | "clear" | string;
type Phase = "scan" | "manual" | "resolving" | "form" | "confirm" | "saving" | "success" | "archived";

type Props = {
  restaurants: AdminRestaurant[];
  profiles: BusinessProfile[];
  onClose: () => void;
  onUpdated: (unit: DynamicLinkUnit) => void;
};

const permanentBaseUrl = "https://go.thaledon.com";
const profileLinkDefaults: Array<{ kind: string; label: string; href: string; enabled: boolean }> = [
  { kind: "menu", label: "Carta", href: "https://parahoy.thaledon.com/carta", enabled: false },
  { kind: "google_review", label: "Reseñas de Google", href: "https://www.google.com/maps", enabled: false },
  { kind: "instagram", label: "Instagram", href: "https://instagram.com", enabled: false },
  { kind: "tiktok", label: "TikTok", href: "https://tiktok.com", enabled: false },
  { kind: "website", label: "Página web", href: "https://example.com", enabled: false },
  { kind: "whatsapp", label: "WhatsApp", href: "https://wa.me/573000000000", enabled: false },
  { kind: "phone", label: "Teléfono", href: "+57 300 000 0000", enabled: false },
];
const idleGooglePreparation: GoogleReviewPreparationState = { status: "idle" };

export function QuickDynamicLinkSetup({ restaurants, profiles, onClose, onUpdated }: Props) {
  const [phase, setPhase] = useState<Phase>("scan");
  const [unit, setUnit] = useState<DynamicLinkUnit>();
  const [reference, setReference] = useState("");
  const [label, setLabel] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [targetMode, setTargetMode] = useState<"redirect" | "profile">("redirect");
  const [profileId, setProfileId] = useState("");
  const [createProfile, setCreateProfile] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileHeadline, setProfileHeadline] = useState("");
  const [profileLocation, setProfileLocation] = useState("");
  const [profileAddress, setProfileAddress] = useState("");
  const [profileLinks, setProfileLinks] = useState(() => profileLinkDefaults.map((link) => ({ ...link })));
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
      setTargetMode(result.unit.destinationType === "profile" ? "profile" : "redirect");
      setProfileId(result.unit.profileId ?? "");
      setCreateProfile(false);
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
    const normalizedLabel = label.trim();
    if (!normalizedLabel) {
      setError("La etiqueta o nombre del lugar es obligatoria.");
      return;
    }
    if (normalizedLabel.length > 160) {
      setError("La etiqueta no puede superar 160 caracteres.");
      return;
    }
    if (targetMode === "profile") {
      if (!profileId && (!createProfile || !profileDisplayName.trim())) {
        setError("Selecciona un perfil publicado o crea uno indicando el nombre del negocio.");
        return;
      }
      if (createProfile) {
        const textLimits: Array<[string, string, number]> = [
          ["el nombre del negocio", profileDisplayName, BUSINESS_PROFILE_LIMITS.displayName],
          ["la descripción corta", profileHeadline, BUSINESS_PROFILE_LIMITS.headline],
          ["la sede", profileLocation, BUSINESS_PROFILE_LIMITS.locationName],
          ["la dirección", profileAddress, BUSINESS_PROFILE_LIMITS.address],
        ];
        const invalidText = textLimits.find(([, value, max]) => value.trim().length > max);
        if (invalidText) {
          setError(`${invalidText[0]} no puede superar ${invalidText[2]} caracteres.`);
          return;
        }
        const invalidLink = profileLinks.find((link) => link.enabled && !link.href.trim());
        if (invalidLink) {
          setError(`Completa el enlace de ${invalidLink.label} o déjalo desactivado.`);
          return;
        }
        try {
          profileLinks.filter((link) => link.enabled).forEach((link) => normalizeBusinessProfileLink(link.kind as BusinessProfileLinkKind, link.href));
        } catch (error) {
          setError(error instanceof Error && error.message === "business_profile_phone_invalid"
            ? "Teléfono o WhatsApp: usa entre 7 y 15 dígitos, con +, espacios, paréntesis o guiones; no agregues extensiones."
            : "Revisa los enlaces activos. Usa URLs HTTPS públicas y prepara las reseñas de Google antes de guardar.");
          return;
        }
      }
      setError("");
      if (unit.status === "active") {
        setPhase("confirm");
        return;
      }
      void save();
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
    if (targetMode === "redirect" && !destination) {
      setError("Vuelve a preparar y confirmar el enlace de reseña antes de guardar.");
      setPhase("form");
      return;
    }

    setPhase("saving");
    setError("");
    try {
      const target = targetMode === "profile"
        ? profileId
          ? { kind: "profile" as const, profileId }
          : { kind: "profile" as const, creationRequestId: crypto.randomUUID(), displayName: profileDisplayName.trim(), headline: profileHeadline.trim() || undefined, locationName: profileLocation.trim() || undefined, address: profileAddress.trim() || undefined, tenantId: association === "preserve" ? unit.tenantId ?? null : association === "clear" ? null : association, links: profileLinks.map((link, index) => ({ ...link, sortOrder: (index + 1) * 10 })) }
        : undefined;
      const result = await quickConfigureDynamicLink(unit.id, {
        revision: unit.revision,
        label: label.trim(),
        ...(target ? { target } : { destinationUrl: destination! }),
        ...(association === "preserve" ? {} : { tenantId: association === "clear" ? null : association }),
      });
      setUnit(result.unit);
      onUpdated(result.unit);
      setCopyFailed(false);
      setCopied(false);
      setPhase("success");
    } catch (saveError) {
      setError(formatBusinessProfileError(saveError, "No se pudo guardar la configuración. Revisa los campos e inténtalo de nuevo."));
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

  async function openNfcHelper() {
    if (!unit) return;
    try {
      const handoff = await createNfcHandoff(unit.id);
      sessionStorage.setItem(`nfc-handoff:${handoff.sessionId}`, handoff.token);
      window.location.href = handoff.handoffUrl;
    } catch (handoffError) {
      setError(formatError(handoffError));
    }
  }

  function scanAnother() {
    googlePreparationAttempt.current += 1;
    setUnit(undefined);
    setReference("");
    setLabel("");
    setDestinationUrl("");
    setTargetMode("redirect"); setProfileId(""); setCreateProfile(false); setProfileDisplayName(""); setProfileHeadline(""); setProfileLocation(""); setProfileAddress(""); setProfileLinks(profileLinkDefaults.map((link) => ({ ...link })));
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
    targetMode === "redirect"
    &&
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
              <input aria-describedby="quick-setup-label-hint" className="mt-2 h-12 w-full rounded-xl border border-[rgba(118,93,71,0.16)] px-3 text-base font-normal" disabled={isFormLocked} maxLength={160} onChange={(event) => setLabel(event.target.value)} value={label} />
            <p className="mt-1 text-xs font-normal text-[var(--text-faint)]" id="quick-setup-label-hint">Etiqueta visible para identificar la unidad · {label.length}/160</p>
            </label>
            <div className="rounded-2xl border border-[rgba(118,93,71,0.14)] bg-white p-4">
              <p className="text-sm font-bold text-[var(--text-strong)]">Destino</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className={`rounded-xl border px-3 py-3 text-sm font-bold ${targetMode === "redirect" ? "bg-[var(--text-strong)] text-white" : ""}`} disabled={isFormLocked} onClick={() => setTargetMode("redirect")} type="button">Redirección</button>
                <button className={`rounded-xl border px-3 py-3 text-sm font-bold ${targetMode === "profile" ? "bg-[var(--text-strong)] text-white" : ""}`} disabled={isFormLocked} onClick={() => setTargetMode("profile")} type="button">Perfil 42day</button>
              </div>
              {targetMode === "redirect" ? (
                <label className="mt-4 block text-sm font-bold text-[var(--text-strong)]">
                  URL destino
                  <input className="mt-2 h-12 w-full rounded-xl border border-[rgba(118,93,71,0.16)] px-3 text-base font-normal" disabled={isFormLocked} inputMode="url" maxLength={BUSINESS_PROFILE_LIMITS.linkHref} onChange={(event) => updateDestination(event.target.value)} placeholder="https://…" value={destinationUrl} />
                </label>
              ) : (
                <div className="mt-4 space-y-3">
                  <label className="block text-sm font-bold">Perfil publicado<select className="mt-2 h-12 w-full rounded-xl border px-3 font-normal" disabled={isFormLocked || createProfile} onChange={(event) => { setProfileId(event.target.value); setCreateProfile(false); }} value={profileId}><option value="">Selecciona un perfil</option>{profiles.filter((profile) => profile.status === "published").map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName} · /p/{profile.slug}</option>)}</select></label>
                  <label className="flex items-center gap-2 text-sm"><input checked={createProfile} disabled={isFormLocked} onChange={(event) => { setCreateProfile(event.target.checked); if (event.target.checked) setProfileId(""); }} type="checkbox" />Crear perfil rápido</label>
                  {createProfile && <>
                    <input aria-label="Nombre del negocio" className="h-11 w-full rounded-xl border px-3 text-sm" disabled={isFormLocked} maxLength={BUSINESS_PROFILE_LIMITS.displayName} onChange={(event) => setProfileDisplayName(event.target.value)} placeholder="Nombre del negocio" value={profileDisplayName} />
                    <input aria-label="Descripción corta" className="h-11 w-full rounded-xl border px-3 text-sm" disabled={isFormLocked} maxLength={BUSINESS_PROFILE_LIMITS.headline} onChange={(event) => setProfileHeadline(event.target.value)} placeholder="Descripción corta (opcional)" value={profileHeadline} />
                    <div className="grid gap-3 sm:grid-cols-2"><input aria-label="Sede o ciudad" className="h-11 w-full rounded-xl border px-3 text-sm" disabled={isFormLocked} maxLength={BUSINESS_PROFILE_LIMITS.locationName} onChange={(event) => setProfileLocation(event.target.value)} placeholder="Sede o ciudad" value={profileLocation} /><input aria-label="Dirección" className="h-11 w-full rounded-xl border px-3 text-sm" disabled={isFormLocked} maxLength={BUSINESS_PROFILE_LIMITS.address} onChange={(event) => setProfileAddress(event.target.value)} placeholder="Dirección (opcional)" value={profileAddress} /></div>
                    <div className="space-y-2"><p className="text-xs font-bold text-[var(--text-soft)]">Enlaces visibles</p><p className="text-xs text-[var(--text-faint)]">Activa solo los enlaces que quieras publicar. Teléfono y WhatsApp aceptan 7–15 dígitos, por ejemplo +57 300 123 4567.</p>{profileLinks.map((link, index) => <div className="grid grid-cols-[auto_1fr] items-center gap-2" key={link.kind}><input aria-label={`Activar ${link.label}`} checked={link.enabled} disabled={isFormLocked} onChange={(event) => setProfileLinks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.checked } : item))} type="checkbox" /><input aria-label={`${link.label} URL o número`} className="h-10 w-full rounded-lg border px-3 text-sm" disabled={isFormLocked} inputMode={link.kind === "phone" || link.kind === "whatsapp" ? "tel" : "url"} maxLength={BUSINESS_PROFILE_LIMITS.linkHref} onChange={(event) => setProfileLinks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, href: event.target.value } : item))} placeholder={link.label} value={link.href} /></div>)}</div>
                  </>}
                </div>
              )}
            </div>

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
                <p className="mt-2 break-all text-[var(--text-soft)]"><span className="font-semibold">Nuevo:</span> {targetMode === "profile" ? (profileId ? "Perfil publicado seleccionado" : `Perfil nuevo: ${profileDisplayName || "sin nombre"}`) : destinationForConfirmation}</p>
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
            <button className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold" onClick={() => void openNfcHelper()} type="button"><Radio size={17} />Escribir con NFC Helper</button>
            <a className="mt-3 block text-center text-sm font-bold underline" href="https://apps.apple.com/us/app/nfc-helper/id6472720100" rel="noopener noreferrer" target="_blank">Instalar NFC Helper</a>
            <p className="mt-3 text-xs text-[var(--text-soft)]">El callback solo informa una escritura reportada. La verificación y el bloqueo físico se registran por separado después de leer el chip.</p>
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
