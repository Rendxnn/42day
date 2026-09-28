import { useEffect, useMemo, useState } from "react";
import { BUSINESS_PROFILE_DEFAULT_APPEARANCE, BUSINESS_PROFILE_LIMITS } from "@42day/types";
import type { BusinessProfileAppearance, BusinessProfileLink, BusinessProfileResponse } from "@42day/types";
import { normalizeHexColor, validateBusinessProfileAppearance } from "@42day/core";
import {
  createBusinessProfile,
  disableBusinessProfileAndSuspend,
  getBusinessProfile,
  publishBusinessProfile,
  resolveGoogleReviewDestination,
  updateBusinessProfile,
  uploadBusinessProfileAvatar,
} from "../../api";
import { BusinessProfileCard } from "../public-profile/BusinessProfileCard";
import { formatBusinessProfileError } from "./business-profile-errors";

type Props = { profileId?: string; onClose: () => void; onSaved: (profile: BusinessProfileResponse) => void };
const kinds: Array<{ kind: BusinessProfileLink["kind"]; label: string; placeholder: string }> = [
  { kind: "menu", label: "Carta", placeholder: "https://…" }, { kind: "google_review", label: "Reseñas Google", placeholder: "https://www.google.com/maps/…" },
  { kind: "whatsapp", label: "WhatsApp", placeholder: "+57…" }, { kind: "phone", label: "Teléfono", placeholder: "+57…" },
  { kind: "instagram", label: "Instagram", placeholder: "https://instagram.com/…" }, { kind: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@…" },
  { kind: "facebook", label: "Facebook", placeholder: "https://facebook.com/…" }, { kind: "website", label: "Página web", placeholder: "https://…" },
  { kind: "maps", label: "Maps", placeholder: "https://www.google.com/maps/…" }, { kind: "survey", label: "Encuesta", placeholder: "https://…" },
  { kind: "custom", label: "Enlace personalizado", placeholder: "https://…" },
];
const colorFields = [
  ["backgroundColor", "Fondo de página"], ["cardColor", "Fondo de tarjeta"], ["textColor", "Texto"], ["iconColor", "Iconos"],
] as const;

export function BusinessProfileModal({ profileId, onClose, onSaved }: Props) {
  const [profile, setProfile] = useState<BusinessProfileResponse>();
  const [displayName, setDisplayName] = useState(""); const [slug, setSlug] = useState("");
  const [headline, setHeadline] = useState(""); const [locationName, setLocationName] = useState(""); const [address, setAddress] = useState("");
  const [links, setLinks] = useState<BusinessProfileLink[]>([]);
  const [appearance, setAppearance] = useState<BusinessProfileAppearance>({ ...BUSINESS_PROFILE_DEFAULT_APPEARANCE });
  const [avatarAssetId, setAvatarAssetId] = useState<string | null>(null); const [avatarAltText, setAvatarAltText] = useState("");
  const [avatarPreview, setAvatarPreview] = useState(""); const [avatarFile, setAvatarFile] = useState<File>();
  const [baseline, setBaseline] = useState(""); const [notice, setNotice] = useState(""); const [error, setError] = useState("");
  const [saving, setSaving] = useState(false); const [loading, setLoading] = useState(Boolean(profileId)); const [resolvingReview, setResolvingReview] = useState(false);
  const publicUrl = useMemo(() => profile ? `${window.location.origin}/p/${profile.profile.slug}` : "", [profile]);
  const draft = { displayName, slug, headline, locationName, address, links, appearance, avatarAssetId, avatarAltText };
  const isDirty = useMemo(() => serialize(draft) !== baseline, [displayName, slug, headline, locationName, address, links, appearance, avatarAssetId, avatarAltText, baseline]);

  useEffect(() => {
    if (!profileId) { hydrateEmpty(); setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError("");
    void getBusinessProfile(profileId).then((value) => { if (!cancelled) hydrate(value); })
      .catch((loadError) => { if (!cancelled) setError(formatBusinessProfileError(loadError, "No se pudo cargar el perfil vigente.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profileId]);
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); });
  useEffect(() => () => { if (avatarPreview.startsWith("blob:")) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);

  function hydrateEmpty() {
    const empty = { displayName: "", slug: "", headline: "", locationName: "", address: "", links: [] as BusinessProfileLink[], appearance: { ...BUSINESS_PROFILE_DEFAULT_APPEARANCE }, avatarAssetId: null, avatarAltText: "" };
    setProfile(undefined); setDisplayName(""); setSlug(""); setHeadline(""); setLocationName(""); setAddress(""); setLinks([]); setAppearance(empty.appearance); setAvatarAssetId(null); setAvatarAltText(""); setAvatarPreview(""); setAvatarFile(undefined); setBaseline(serialize(empty));
  }
  function hydrate(value: BusinessProfileResponse) {
    const next = { displayName: value.profile.displayName, slug: value.profile.slug, headline: value.profile.headline ?? "", locationName: value.profile.locationName ?? "", address: value.profile.address ?? "", links: value.links, appearance: value.profile.appearance ?? { ...BUSINESS_PROFILE_DEFAULT_APPEARANCE }, avatarAssetId: value.profile.avatar?.assetId ?? null, avatarAltText: value.profile.avatar?.altText ?? "" };
    setProfile(value); setDisplayName(next.displayName); setSlug(next.slug); setHeadline(next.headline); setLocationName(next.locationName); setAddress(next.address); setLinks(next.links); setAppearance(next.appearance); setAvatarAssetId(next.avatarAssetId); setAvatarAltText(next.avatarAltText); setAvatarPreview(value.profile.avatar?.url ?? ""); setAvatarFile(undefined); setBaseline(serialize(next));
  }
  function close() { if (isDirty && !window.confirm("Tienes cambios sin guardar. ¿Quieres descartarlos?")) return; onClose(); }
  function updateLink(kind: BusinessProfileLink["kind"], patch: Partial<BusinessProfileLink>) {
    setLinks((current) => { const old = current.find((link) => link.kind === kind); if (old) return current.map((link) => link.kind === kind ? { ...link, ...patch } : link); return [...current, { kind, label: kinds.find((item) => item.kind === kind)?.label, href: "", enabled: false, sortOrder: current.length * 10 + 10, ...patch }]; });
  }
  async function chooseAvatar(file?: File) { setAvatarFile(file); setAvatarPreview(file ? URL.createObjectURL(file) : ""); if (!file) { setAvatarAssetId(null); setAvatarAltText(""); } }
  async function createDraft() {
    const created = await createBusinessProfile({ requestId: crypto.randomUUID(), slug: slug || undefined, displayName: displayName.trim(), headline, locationName, address });
    return getBusinessProfile(created.profile.id);
  }
  async function save() {
    setSaving(true); setError("");
    try {
      const cleanAppearance = validateBusinessProfileAppearance(appearance).appearance;
      const current = profile ?? await createDraft();
      const nextAvatar = avatarFile ? (await uploadBusinessProfileAvatar(current.profile.id, avatarFile)).assetId : avatarAssetId;
      const result = await updateBusinessProfile(current.profile.id, { revision: current.profile.revision, displayName, headline, locationName, address, links, appearance: cleanAppearance, avatarAssetId: nextAvatar, avatarAltText: avatarAltText.trim() || undefined });
      hydrate(result); onSaved(result); setNotice(profile ? "Perfil guardado." : "Perfil creado en borrador.");
    } catch (saveError) { setError(formatBusinessProfileError(saveError, "No se pudo guardar el perfil.")); }
    finally { setSaving(false); }
  }
  async function publish() {
    if (!profile || !window.confirm("¿Publicar este perfil y hacerlo accesible desde su URL canónica?")) return;
    setSaving(true); setError(""); try { const result = await publishBusinessProfile(profile.profile.id, profile.profile.revision); hydrate(result); onSaved(result); setNotice("Perfil publicado."); }
    catch (publishError) { setError(formatBusinessProfileError(publishError, "No se pudo publicar el perfil. Revisa el contraste y los enlaces.")); } finally { setSaving(false); }
  }
  async function disable() {
    if (!profile) return;
    const count = profile.activeQrCount ?? 0; const message = count ? `Se suspenderán ${count} QR(s) activos y se conservarán sus URL permanentes.` : "No hay QRs activos asociados.";
    if (!window.confirm(`¿Deshabilitar el perfil? ${message} Esta operación es terminal.`)) return;
    setSaving(true); setError(""); try { const result = await disableBusinessProfileAndSuspend(profile.profile.id, profile.profile.revision); hydrate(result.profile); onSaved(result.profile); setNotice(`Perfil deshabilitado; QRs suspendidos: ${result.suspendedUnitCount}.`); }
    catch (disableError) { setError(formatBusinessProfileError(disableError, "No se pudo deshabilitar el perfil.")); } finally { setSaving(false); }
  }
  async function prepareGoogleReview() {
    const input = links.find((link) => link.kind === "google_review")?.href?.trim();
    if (!input) { setError("Pega primero un enlace de Google Maps para preparar la reseña."); return; }
    setResolvingReview(true); setError("");
    try { const result = await resolveGoogleReviewDestination({ destinationUrl: input }); if (window.confirm(`Google propone esta URL de reseñas:\n${result.resolution.reviewUrl}\n\nConfirma visualmente que corresponde al negocio antes de guardarla.`)) { updateLink("google_review", { href: result.resolution.reviewUrl }); setNotice("Reseña preparada; guarda el perfil para persistirla."); } }
    catch (resolveError) { setError(formatBusinessProfileError(resolveError, "No se pudo preparar el enlace de reseñas.")); } finally { setResolvingReview(false); }
  }

  const previewLinks = links.filter((link) => link.enabled && link.href).map(({ kind, label, href, sortOrder }) => ({ kind, label, href, sortOrder }));
  const previewProfile = { slug: slug || "vista-previa", displayName: displayName || "Nombre del negocio", headline, locationName, address, appearance, ...(avatarPreview ? { avatar: { assetId: avatarAssetId ?? "preview", altText: avatarAltText || displayName, url: avatarPreview } } : {}) };
  const disabled = profile?.profile.status === "disabled";

  return <div aria-label={profileId ? "Editar perfil de negocio" : "Crear perfil de negocio"} aria-modal="true" className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3 sm:p-8" role="dialog">
    <div className="mx-auto max-w-6xl rounded-[22px] bg-white p-5 text-[var(--text-strong)] shadow-2xl sm:p-7">
      <div className="flex items-start justify-between gap-4 border-b pb-5"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Presencia digital</p><h2 className="mt-2 text-2xl font-extrabold">{profileId ? "Editar perfil de negocio" : "Crear perfil de negocio"}</h2><p className="mt-2 text-sm text-[var(--text-soft)]">Los datos se cargan desde la revisión vigente antes de editar.</p></div><button aria-label="Cerrar" className="rounded-lg border px-3 py-2 text-xl" onClick={close} type="button">×</button></div>
      {loading ? <div className="grid min-h-40 place-items-center text-sm">Cargando perfil vigente…</div> : <>
        <div className="mt-5 grid gap-6 xl:grid-cols-[1fr_360px]">
          <div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre" value={displayName} maxLength={BUSINESS_PROFILE_LIMITS.displayName} hint="Nombre visible del negocio" onChange={setDisplayName} disabled={disabled} />
              <Field label="Slug (estable tras publicar)" value={slug} maxLength={BUSINESS_PROFILE_LIMITS.slug} hint="Solo letras minúsculas, números y guiones" onChange={setSlug} disabled={Boolean(profile) || disabled} />
              <Field label="Titular" value={headline} maxLength={BUSINESS_PROFILE_LIMITS.headline} hint="Descripción corta" onChange={setHeadline} disabled={disabled} wide />
              <Field label="Sede" value={locationName} maxLength={BUSINESS_PROFILE_LIMITS.locationName} hint="Ciudad o sede" onChange={setLocationName} disabled={disabled} />
              <Field label="Dirección" value={address} maxLength={BUSINESS_PROFILE_LIMITS.address} hint="Dirección pública" onChange={setAddress} disabled={disabled} />
            </div>
            <section className="mt-5 rounded-2xl border p-4"><h3 className="text-sm font-extrabold">Apariencia</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">{colorFields.map(([key, label]) => <label className="flex items-center justify-between gap-2 text-xs font-bold" key={key}>{label}<span className="flex items-center gap-2"><input aria-label={label} className="h-9 w-12 rounded border" disabled={disabled} onChange={(event) => setAppearance((value) => ({ ...value, [key]: event.target.value.toUpperCase() }))} type="color" value={normalizeHexColor(appearance[key]) ?? "#FFFFFF"} /><input aria-label={`${label} hexadecimal`} className="h-9 w-24 rounded border px-2 font-mono" disabled={disabled} maxLength={7} onBlur={() => { const color = normalizeHexColor(appearance[key]); if (color) setAppearance((value) => ({ ...value, [key]: color })); }} onChange={(event) => setAppearance((value) => ({ ...value, [key]: event.target.value }))} value={appearance[key]} /></span></label>)}</div><label className="mt-3 flex items-center justify-between gap-3 text-xs font-bold">Iconos<select className="h-10 rounded-lg border px-2" disabled={disabled} onChange={(event) => setAppearance((value) => ({ ...value, iconMode: event.target.value as BusinessProfileAppearance["iconMode"] }))} value={appearance.iconMode}><option value="brand">Color de plataforma</option><option value="monochrome">Monocromos personalizados</option></select></label>{contrastWarning(appearance)}</section>
            <section className="mt-4 rounded-2xl border p-4"><h3 className="text-sm font-extrabold">Foto o logo</h3><p className="mt-1 text-xs text-[var(--text-soft)]">JPEG, PNG o WebP, máximo 3 MB, dimensiones 64–4096 px. Se rechazan metadatos EXIF/GPS/XMP/texto.</p><input accept="image/jpeg,image/png,image/webp" aria-label="Foto o logo del negocio" className="mt-3 block w-full text-sm" disabled={disabled} onChange={(event) => void chooseAvatar(event.target.files?.[0])} type="file" /><div className="mt-3"><Field label="Texto alternativo" value={avatarAltText} maxLength={160} hint="Describe brevemente la imagen" onChange={setAvatarAltText} disabled={disabled} /></div>{avatarPreview && <button className="mt-2 text-xs font-bold text-red-700 underline" onClick={() => void chooseAvatar(undefined)} type="button">Quitar foto</button>}</section>
            <section className="mt-5 space-y-2"><h3 className="text-sm font-extrabold">Enlaces visibles y activables</h3>{kinds.map((entry) => { const link = links.find((item) => item.kind === entry.kind); return <div className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[130px_1fr_auto_auto] sm:items-center" key={entry.kind}><span className="text-sm font-bold">{entry.label}</span><input aria-label={`${entry.label} URL o número`} className="h-9 min-w-0 rounded-lg border px-2 text-sm" disabled={disabled} inputMode={entry.kind === "phone" || entry.kind === "whatsapp" ? "tel" : "url"} maxLength={BUSINESS_PROFILE_LIMITS.linkHref} onChange={(event) => updateLink(entry.kind, { href: event.target.value })} placeholder={entry.placeholder} value={link?.href ?? ""} /><label className="inline-flex items-center gap-2 text-xs font-bold"><input checked={link?.enabled ?? false} disabled={disabled} onChange={(event) => updateLink(entry.kind, { enabled: event.target.checked })} type="checkbox" />Activar</label>{entry.kind === "google_review" && <button className="h-9 rounded-lg border px-2 text-xs font-bold" disabled={resolvingReview || saving || disabled} onClick={() => void prepareGoogleReview()} type="button">{resolvingReview ? "Preparando…" : "Preparar reseña"}</button>}</div>; })}</section>
          </div>
          <aside className="xl:sticky xl:top-4 xl:self-start"><h3 className="mb-2 text-sm font-bold">Vista previa móvil</h3><div className="overflow-hidden rounded-[26px] border bg-neutral-100"><div className="h-6 bg-black" /><BusinessProfileCard preview profile={previewProfile} links={previewLinks} /></div></aside>
        </div>
        {publicUrl && <div className="mt-4"><a className="text-sm font-bold text-[var(--text-soft)] underline" href={publicUrl} rel="noreferrer" target="_blank">Abrir perfil público</a><p className="mt-2 text-xs text-[var(--text-soft)]">QRs activos que consumen este perfil: <strong>{profile?.activeQrCount ?? 0}</strong></p></div>}
        <div className="mt-6 flex flex-wrap gap-2"><button className="h-11 rounded-xl bg-[var(--text-strong)] px-4 text-sm font-bold text-white disabled:opacity-50" disabled={saving || !displayName.trim() || disabled} onClick={() => void save()} type="button">{saving ? "Guardando…" : "Guardar cambios"}</button>{profile?.profile.status === "draft" && <button className="h-11 rounded-xl border px-4 text-sm font-bold" disabled={saving} onClick={() => void publish()} type="button">Publicar</button>}{profile && !disabled && <button className="h-11 rounded-xl border border-red-700 px-4 text-sm font-bold text-red-700" disabled={saving} onClick={() => void disable()} type="button">Deshabilitar perfil</button>}</div>
        {(error || notice) && <p aria-live="polite" className={`mt-4 rounded-xl px-3 py-2 text-sm font-bold ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{error || notice}</p>}
      </>}
    </div>
  </div>;
}

function contrastWarning(appearance: BusinessProfileAppearance) {
  try { const result = validateBusinessProfileAppearance(appearance); const okay = result.textContrast >= 4.5 && (appearance.iconMode !== "monochrome" || result.iconContrast >= 3); return <p aria-live="polite" className={`mt-3 text-xs font-semibold ${okay ? "text-green-700" : "text-amber-700"}`}>{okay ? "Contraste legible." : `Advertencia: texto ${result.textContrast.toFixed(2)}:1; iconos ${result.iconContrast.toFixed(2)}:1. Se permite guardar el borrador, pero no publicarlo.`}</p>; } catch { return <p className="mt-3 text-xs text-amber-700">Completa colores hexadecimales válidos para revisar contraste.</p>; }
}
function Field({ label, value, onChange, disabled, wide, maxLength, hint }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; wide?: boolean; maxLength: number; hint: string }) { const hintId = `business-profile-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-hint`; return <label className={`text-xs font-bold text-[var(--text-soft)] ${wide ? "sm:col-span-2" : ""}`}>{label}<input aria-describedby={hintId} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" disabled={disabled} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} value={value} /><span className="mt-1 block text-[11px] font-normal text-[var(--text-faint)]" id={hintId}>{hint} · {value.length}/{maxLength}</span></label>; }
function serialize(value: object) { return JSON.stringify(value); }
