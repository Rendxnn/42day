import { useEffect, useMemo, useState } from "react";
import type { BusinessProfileLink, BusinessProfileResponse } from "@42day/types";
import {
  DashboardApiError,
  createBusinessProfile,
  disableBusinessProfileAndSuspend,
  getBusinessProfile,
  publishBusinessProfile,
  resolveGoogleReviewDestination,
  updateBusinessProfile,
} from "../../api";

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

export function BusinessProfileEditor() {
  const [profileId, setProfileId] = useState("");
  const [profile, setProfile] = useState<BusinessProfileResponse>();
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [headline, setHeadline] = useState("");
  const [locationName, setLocationName] = useState("");
  const [address, setAddress] = useState("");
  const [links, setLinks] = useState<BusinessProfileLink[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [resolvingReview, setResolvingReview] = useState(false);

  const publicUrl = useMemo(() => profile ? `${window.location.origin}/p/${profile.profile.slug}` : "", [profile]);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.profile.displayName);
    setSlug(profile.profile.slug);
    setHeadline(profile.profile.headline ?? "");
    setLocationName(profile.profile.locationName ?? "");
    setAddress(profile.profile.address ?? "");
    setLinks(profile.links);
  }, [profile]);

  async function load() {
    if (!profileId.trim()) return;
    setSaving(true); setError("");
    try { setProfile(await getBusinessProfile(profileId.trim())); setNotice("Perfil cargado."); }
    catch (loadError) { setError(formatError(loadError, "No se pudo cargar el perfil.")); }
    finally { setSaving(false); }
  }

  async function create() {
    setSaving(true); setError("");
    try {
      const result = await createBusinessProfile({ requestId: crypto.randomUUID(), slug: slug || undefined, displayName: displayName.trim(), headline, locationName, address });
      setProfileId(result.profile.id);
      await loadProfile(result.profile.id);
      setNotice("Perfil creado en borrador.");
    } catch (createError) { setError(formatError(createError, "No se pudo crear el perfil.")); }
    finally { setSaving(false); }
  }

  async function save() {
    if (!profile) return;
    setSaving(true); setError("");
    try {
      setProfile(await updateBusinessProfile(profile.profile.id, { revision: profile.profile.revision, displayName, headline, locationName, address, links }));
      setNotice("Perfil guardado. Los enlaces ocultos siguen preparados, pero no son públicos.");
    } catch (saveError) { setError(formatError(saveError, "No se pudo guardar el perfil.")); }
    finally { setSaving(false); }
  }

  async function publish() {
    if (!profile || !window.confirm("Publicar este perfil y hacerlo accesible desde su URL canónica?")) return;
    setSaving(true); setError("");
    try { setProfile(await publishBusinessProfile(profile.profile.id, profile.profile.revision)); setNotice("Perfil publicado."); }
    catch (publishError) { setError(formatError(publishError, "No se pudo publicar el perfil.")); }
    finally { setSaving(false); }
  }

  async function disable() {
    if (!profile) return;
    const activeQrCount = profile.activeQrCount ?? 0;
    const impact = activeQrCount > 0
      ? `Se suspenderán ${activeQrCount} QR(s) activos y se conservarán sus URL permanentes.`
      : "No hay QRs activos asociados.";
    if (!window.confirm(`Deshabilitar el perfil y suspender sus QRs activos? ${impact} Esta operación es terminal.`)) return;
    setSaving(true); setError("");
    try {
      const result = await disableBusinessProfileAndSuspend(profile.profile.id, profile.profile.revision);
      setProfile(result.profile);
      setNotice(`Perfil deshabilitado; QRs suspendidos: ${result.suspendedUnitCount}.`);
    } catch (disableError) { setError(formatError(disableError, "No se pudo deshabilitar el perfil.")); }
    finally { setSaving(false); }
  }

  async function loadProfile(id: string) {
    const result = await getBusinessProfile(id);
    setProfile(result);
  }

  function updateLink(kind: BusinessProfileLink["kind"], patch: Partial<BusinessProfileLink>) {
    setLinks((current) => {
      const existing = current.find((link) => link.kind === kind);
      if (existing) return current.map((link) => link.kind === kind ? { ...link, ...patch } : link);
      return [...current, { kind, label: kinds.find((entry) => entry.kind === kind)?.label, href: "", enabled: false, sortOrder: current.length * 10 + 10, ...patch }];
    });
  }

  async function prepareGoogleReview() {
    const input = links.find((link) => link.kind === "google_review")?.href?.trim();
    if (!input) {
      setError("Pega primero un enlace de Google Maps para preparar la reseña.");
      return;
    }
    setResolvingReview(true);
    setError("");
    try {
      const result = await resolveGoogleReviewDestination({ destinationUrl: input });
      if (!window.confirm(`Google propone esta URL de reseñas:\n${result.resolution.reviewUrl}\n\nConfirma visualmente que corresponde al negocio antes de guardarla.`)) return;
      updateLink("google_review", { href: result.resolution.reviewUrl });
      setNotice("Reseña preparada; confirma y guarda el perfil para persistirla.");
    } catch (resolveError) {
      setError(formatError(resolveError, "No se pudo preparar el enlace de reseñas."));
    } finally {
      setResolvingReview(false);
    }
  }

  return <section className="rounded-[22px] bg-white p-5 text-[var(--text-strong)] sm:p-6">
    <div className="flex flex-col gap-3 border-b border-[rgba(118,93,71,0.12)] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Presencia digital</p><h2 className="mt-2 text-2xl font-extrabold">Perfil de negocio</h2><p className="mt-2 text-sm text-[var(--text-soft)]">Crea un perfil ligero con enlaces activables y úsalo como destino canónico de un QR.</p></div>
      {profile && <span className="rounded-full bg-[var(--surface-base)] px-3 py-1.5 text-xs font-bold">{profile.profile.status}</span>}
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-bold text-[var(--text-soft)]">ID del perfil existente<input className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" onChange={(event) => setProfileId(event.target.value)} placeholder="UUID" value={profileId} /></label>
      <button className="mt-5 h-10 rounded-lg border px-3 text-sm font-bold" disabled={saving || !profileId.trim()} onClick={() => void load()} type="button">Cargar perfil</button>
      <label className="text-xs font-bold text-[var(--text-soft)]">Nombre<input className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" disabled={Boolean(profile)} onChange={(event) => setDisplayName(event.target.value)} value={displayName} /></label>
      <label className="text-xs font-bold text-[var(--text-soft)]">Slug (estable tras publicar)<input className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" disabled={Boolean(profile)} onChange={(event) => setSlug(event.target.value)} placeholder="mi-negocio" value={slug} /></label>
      <label className="text-xs font-bold text-[var(--text-soft)] sm:col-span-2">Titular<input className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" onChange={(event) => setHeadline(event.target.value)} value={headline} /></label>
      <label className="text-xs font-bold text-[var(--text-soft)]">Sede<input className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" onChange={(event) => setLocationName(event.target.value)} value={locationName} /></label>
      <label className="text-xs font-bold text-[var(--text-soft)]">Dirección<input className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" onChange={(event) => setAddress(event.target.value)} value={address} /></label>
    </div>
    {!profile ? <button className="mt-5 h-11 rounded-xl bg-[var(--text-strong)] px-4 text-sm font-bold text-white" disabled={saving || !displayName.trim()} onClick={() => void create()} type="button">Crear borrador</button> : <>
      <div className="mt-6 space-y-2"><p className="text-sm font-extrabold">Enlaces visibles</p>{kinds.map((entry) => { const link = links.find((item) => item.kind === entry.kind); return <div className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[150px_1fr_auto_auto] sm:items-center" key={entry.kind}><span className="text-sm font-bold">{entry.label}</span><input className="h-9 rounded-lg border px-2 text-sm" onChange={(event) => updateLink(entry.kind, { href: event.target.value })} placeholder={entry.placeholder} value={link?.href ?? ""} /><label className="inline-flex items-center gap-2 text-xs font-bold"><input checked={link?.enabled ?? false} onChange={(event) => updateLink(entry.kind, { enabled: event.target.checked })} type="checkbox" />Activar</label>{entry.kind === "google_review" && <button className="h-9 rounded-lg border px-2 text-xs font-bold" disabled={resolvingReview || saving} onClick={() => void prepareGoogleReview()} type="button">{resolvingReview ? "Preparando…" : "Preparar reseña"}</button>}</div>; })}</div>
      {publicUrl && <>
        <a className="mt-4 block text-sm font-bold text-[var(--text-soft)] underline" href={publicUrl} rel="noreferrer" target="_blank">Abrir perfil público</a>
        <p className="mt-2 text-xs text-[var(--text-soft)]">QRs activos que consumen este perfil: <strong>{profile.activeQrCount ?? 0}</strong></p>
      </>}
      <div className="mt-5 flex flex-wrap gap-2"><button className="h-11 rounded-xl bg-[var(--text-strong)] px-4 text-sm font-bold text-white" disabled={saving || profile.profile.status === "disabled"} onClick={() => void save()} type="button">Guardar cambios</button>{profile.profile.status === "draft" && <button className="h-11 rounded-xl border px-4 text-sm font-bold" disabled={saving} onClick={() => void publish()} type="button">Publicar</button>}{profile.profile.status !== "disabled" && <button className="h-11 rounded-xl border border-[#a74b40] px-4 text-sm font-bold text-[#a74b40]" disabled={saving} onClick={() => void disable()} type="button">Deshabilitar y suspender QRs</button>}</div>
    </>}
    {(error || notice) && <p className={`mt-4 rounded-xl px-3 py-2 text-sm font-bold ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{error || notice}</p>}
  </section>;
}

function formatError(error: unknown, fallback: string) {
  if (error instanceof DashboardApiError) return error.backendError ?? error.message;
  return error instanceof Error ? error.message : fallback;
}
