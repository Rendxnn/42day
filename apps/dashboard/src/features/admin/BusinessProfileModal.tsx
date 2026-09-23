import { useEffect, useMemo, useState } from "react";
import { BUSINESS_PROFILE_LIMITS } from "@42day/types";
import type { BusinessProfileLink, BusinessProfileResponse } from "@42day/types";
import {
  createBusinessProfile,
  disableBusinessProfileAndSuspend,
  getBusinessProfile,
  publishBusinessProfile,
  resolveGoogleReviewDestination,
  updateBusinessProfile,
} from "../../api";
import { formatBusinessProfileError } from "./business-profile-errors";

type Props = {
  profileId?: string;
  onClose: () => void;
  onSaved: (profile: BusinessProfileResponse) => void;
};

const kinds: Array<{ kind: BusinessProfileLink["kind"]; label: string; placeholder: string }> = [
  { kind: "menu", label: "Carta", placeholder: "https://…" },
  { kind: "google_review", label: "Reseñas Google", placeholder: "https://www.google.com/maps/…" },
  { kind: "whatsapp", label: "WhatsApp", placeholder: "+57…" },
  { kind: "phone", label: "Teléfono", placeholder: "+57…" },
  { kind: "instagram", label: "Instagram", placeholder: "https://instagram.com/…" },
  { kind: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@…" },
  { kind: "facebook", label: "Facebook", placeholder: "https://facebook.com/…" },
  { kind: "website", label: "Página web", placeholder: "https://…" },
  { kind: "maps", label: "Maps", placeholder: "https://www.google.com/maps/…" },
  { kind: "survey", label: "Encuesta", placeholder: "https://…" },
  { kind: "custom", label: "Enlace personalizado", placeholder: "https://…" },
];

export function BusinessProfileModal({ profileId, onClose, onSaved }: Props) {
  const [profile, setProfile] = useState<BusinessProfileResponse>();
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [headline, setHeadline] = useState("");
  const [locationName, setLocationName] = useState("");
  const [address, setAddress] = useState("");
  const [links, setLinks] = useState<BusinessProfileLink[]>([]);
  const [baseline, setBaseline] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(profileId));
  const [resolvingReview, setResolvingReview] = useState(false);

  const publicUrl = useMemo(() => profile ? `${window.location.origin}/p/${profile.profile.slug}` : "", [profile]);
  const isDirty = useMemo(() => serialize({ displayName, slug, headline, locationName, address, links }) !== baseline, [displayName, slug, headline, locationName, address, links, baseline]);

  useEffect(() => {
    if (!profileId) {
      setProfile(undefined); setDisplayName(""); setSlug(""); setHeadline(""); setLocationName(""); setAddress(""); setLinks([]); setBaseline(serialize({ displayName: "", slug: "", headline: "", locationName: "", address: "", links: [] })); setLoading(false); return;
    }
    let cancelled = false;
    setLoading(true); setError("");
    void getBusinessProfile(profileId).then((result) => {
      if (cancelled) return;
      hydrate(result);
    }).catch((loadError) => { if (!cancelled) setError(formatBusinessProfileError(loadError, "No se pudo cargar el perfil vigente.")); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profileId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function hydrate(result: BusinessProfileResponse) {
    setProfile(result); setDisplayName(result.profile.displayName); setSlug(result.profile.slug); setHeadline(result.profile.headline ?? ""); setLocationName(result.profile.locationName ?? ""); setAddress(result.profile.address ?? ""); setLinks(result.links); setBaseline(serialize({ displayName: result.profile.displayName, slug: result.profile.slug, headline: result.profile.headline ?? "", locationName: result.profile.locationName ?? "", address: result.profile.address ?? "", links: result.links }));
  }

  function close() {
    if (isDirty && !window.confirm("Tienes cambios sin guardar. ¿Quieres descartarlos?")) return;
    onClose();
  }

  async function save() {
    setSaving(true); setError("");
    try {
      const result = profile
        ? await updateBusinessProfile(profile.profile.id, { revision: profile.profile.revision, displayName, headline, locationName, address, links })
        : await createAndLoad();
      hydrate(result); onSaved(result); setNotice(profile ? "Perfil guardado." : "Perfil creado en borrador.");
    } catch (saveError) { setError(formatBusinessProfileError(saveError, "No se pudo guardar el perfil.")); }
    finally { setSaving(false); }
  }

  async function createAndLoad() {
    const created = await createBusinessProfile({ requestId: crypto.randomUUID(), slug: slug || undefined, displayName: displayName.trim(), headline, locationName, address });
    const fresh = await getBusinessProfile(created.profile.id);
    if (links.length === 0) return fresh;
    return updateBusinessProfile(created.profile.id, { revision: fresh.profile.revision, displayName, headline, locationName, address, links });
  }

  async function publish() {
    if (!profile || !window.confirm("¿Publicar este perfil y hacerlo accesible desde su URL canónica?")) return;
    setSaving(true); setError("");
    try { const result = await publishBusinessProfile(profile.profile.id, profile.profile.revision); hydrate(result); onSaved(result); setNotice("Perfil publicado."); }
    catch (publishError) { setError(formatBusinessProfileError(publishError, "No se pudo publicar el perfil.")); }
    finally { setSaving(false); }
  }

  async function disable() {
    if (!profile) return;
    const count = profile.activeQrCount ?? 0;
    const message = count > 0 ? `Se suspenderán ${count} QR(s) activos y se conservarán sus URL permanentes.` : "No hay QRs activos asociados.";
    if (!window.confirm(`Deshabilitar el perfil? ${message} Esta operación es terminal.`)) return;
    setSaving(true); setError("");
    try { const result = await disableBusinessProfileAndSuspend(profile.profile.id, profile.profile.revision); hydrate(result.profile); onSaved(result.profile); setNotice(`Perfil deshabilitado; QRs suspendidos: ${result.suspendedUnitCount}.`); }
    catch (disableError) { setError(formatBusinessProfileError(disableError, "No se pudo deshabilitar el perfil.")); }
    finally { setSaving(false); }
  }

  function updateLink(kind: BusinessProfileLink["kind"], patch: Partial<BusinessProfileLink>) {
    setLinks((current) => { const existing = current.find((link) => link.kind === kind); if (existing) return current.map((link) => link.kind === kind ? { ...link, ...patch } : link); return [...current, { kind, label: kinds.find((entry) => entry.kind === kind)?.label, href: "", enabled: false, sortOrder: current.length * 10 + 10, ...patch }]; });
  }

  async function prepareGoogleReview() {
    const input = links.find((link) => link.kind === "google_review")?.href?.trim();
    if (!input) { setError("Pega primero un enlace de Google Maps para preparar la reseña."); return; }
    setResolvingReview(true); setError("");
    try { const result = await resolveGoogleReviewDestination({ destinationUrl: input }); if (!window.confirm(`Google propone esta URL de reseñas:\n${result.resolution.reviewUrl}\n\nConfirma visualmente que corresponde al negocio antes de guardarla.`)) return; updateLink("google_review", { href: result.resolution.reviewUrl }); setNotice("Reseña preparada; guarda el perfil para persistirla."); }
    catch (resolveError) { setError(formatBusinessProfileError(resolveError, "No se pudo preparar el enlace de reseñas.")); }
    finally { setResolvingReview(false); }
  }

  return <div aria-label={profileId ? "Editar perfil de negocio" : "Crear perfil de negocio"} aria-modal="true" className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3 sm:p-8" role="dialog"><div className="mx-auto max-w-4xl rounded-[22px] bg-white p-5 text-[var(--text-strong)] shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4 border-b border-[rgba(118,93,71,0.12)] pb-5"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Presencia digital</p><h2 className="mt-2 text-2xl font-extrabold">{profileId ? "Editar perfil de negocio" : "Crear perfil de negocio"}</h2><p className="mt-2 text-sm text-[var(--text-soft)]">Los datos se cargan desde la revisión vigente antes de editar.</p></div><button aria-label="Cerrar" className="rounded-lg border px-3 py-2 text-xl" onClick={close} type="button">×</button></div>{loading ? <div className="grid min-h-40 place-items-center text-sm">Cargando perfil vigente…</div> : <><div className="mt-5 grid gap-3 sm:grid-cols-2"><Field label="Nombre" value={displayName} maxLength={BUSINESS_PROFILE_LIMITS.displayName} hint="Nombre visible del negocio" onChange={setDisplayName} disabled={profile?.profile.status === "disabled"} /><Field label="Slug (estable tras publicar)" value={slug} maxLength={BUSINESS_PROFILE_LIMITS.slug} hint="Solo letras minúsculas, números y guiones" onChange={setSlug} disabled={Boolean(profile) || profile?.profile.status === "disabled"} /><Field label="Titular" value={headline} maxLength={BUSINESS_PROFILE_LIMITS.headline} hint="Descripción corta" onChange={setHeadline} disabled={profile?.profile.status === "disabled"} wide /><Field label="Sede" value={locationName} maxLength={BUSINESS_PROFILE_LIMITS.locationName} hint="Ciudad o sede" onChange={setLocationName} disabled={profile?.profile.status === "disabled"} /><Field label="Dirección" value={address} maxLength={BUSINESS_PROFILE_LIMITS.address} hint="Dirección pública" onChange={setAddress} disabled={profile?.profile.status === "disabled"} /></div><div className="mt-6 space-y-2"><p className="text-sm font-extrabold">Enlaces visibles y activables</p>{kinds.map((entry) => { const link = links.find((item) => item.kind === entry.kind); return <div className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[150px_1fr_auto_auto] sm:items-center" key={entry.kind}><span className="text-sm font-bold">{entry.label}</span><input aria-label={`${entry.label} URL o número`} className="h-9 rounded-lg border px-2 text-sm" disabled={profile?.profile.status === "disabled"} inputMode={entry.kind === "phone" || entry.kind === "whatsapp" ? "tel" : "url"} maxLength={BUSINESS_PROFILE_LIMITS.linkHref} onChange={(event) => updateLink(entry.kind, { href: event.target.value })} placeholder={entry.placeholder} value={link?.href ?? ""} /><label className="inline-flex items-center gap-2 text-xs font-bold"><input checked={link?.enabled ?? false} disabled={profile?.profile.status === "disabled"} onChange={(event) => updateLink(entry.kind, { enabled: event.target.checked })} type="checkbox" />Activar</label>{entry.kind === "google_review" && <button className="h-9 rounded-lg border px-2 text-xs font-bold" disabled={resolvingReview || saving || profile?.profile.status === "disabled"} onClick={() => void prepareGoogleReview()} type="button">{resolvingReview ? "Preparando…" : "Preparar reseña"}</button>}</div>; })}</div>{publicUrl && <div className="mt-4"><a className="text-sm font-bold text-[var(--text-soft)] underline" href={publicUrl} rel="noreferrer" target="_blank">Abrir perfil público</a><p className="mt-2 text-xs text-[var(--text-soft)]">QRs activos que consumen este perfil: <strong>{profile?.activeQrCount ?? 0}</strong></p></div>}<div className="mt-6 flex flex-wrap gap-2"><button className="h-11 rounded-xl bg-[var(--text-strong)] px-4 text-sm font-bold text-white disabled:opacity-50" disabled={saving || !displayName.trim() || profile?.profile.status === "disabled"} onClick={() => void save()} type="button">{saving ? "Guardando…" : "Guardar cambios"}</button>{profile?.profile.status === "draft" && <button className="h-11 rounded-xl border px-4 py-2 text-sm font-bold" disabled={saving} onClick={() => void publish()} type="button">Publicar</button>}{profile && profile.profile.status !== "disabled" && <button className="h-11 rounded-xl border border-[#a74b40] px-4 py-2 text-sm font-bold text-[#a74b40]" disabled={saving} onClick={() => void disable()} type="button">Deshabilitar perfil</button>}</div>{(error || notice) && <p aria-live="polite" className={`mt-4 rounded-xl px-3 py-2 text-sm font-bold ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{error || notice}</p>}</>}</div></div>;
}

function Field({ label, value, onChange, disabled, wide, maxLength, hint, inputMode }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; wide?: boolean; maxLength: number; hint: string; inputMode?: "text" | "url" }) {
  const hintId = `business-profile-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-hint`;
  return <label className={`text-xs font-bold text-[var(--text-soft)] ${wide ? "sm:col-span-2" : ""}`}>{label}<input aria-describedby={hintId} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" disabled={disabled} inputMode={inputMode} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} value={value} /><span className="mt-1 block text-[11px] font-normal text-[var(--text-faint)]" id={hintId}>{hint} · {value.length}/{maxLength}</span></label>;
}
function serialize(value: { displayName: string; slug: string; headline: string; locationName: string; address: string; links: BusinessProfileLink[] }) { return JSON.stringify(value); }
