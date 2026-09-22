import { useEffect, useState } from "react";
import { ExternalLink, Loader2, MapPin, Share2 } from "lucide-react";
import type { BusinessProfilePayload } from "@42day/types";
import { getPublicBusinessProfile } from "../../api";

export function PublicBusinessProfilePage({ slug }: { slug: string }) {
  const [payload, setPayload] = useState<BusinessProfilePayload>();
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    getPublicBusinessProfile(slug).then((next) => { if (active) { setPayload(next); document.title = `${next.profile.displayName} | ParaHoy`; } }).catch(() => { if (active) setError("Esta página todavía no está disponible."); });
    return () => { active = false; };
  }, [slug]);

  async function share() {
    if (navigator.share) { await navigator.share({ title: payload?.profile.displayName, url: window.location.href }).catch(() => undefined); return; }
    await navigator.clipboard.writeText(window.location.href).catch(() => undefined);
    setCopied(true); window.setTimeout(() => setCopied(false), 1_800);
  }

  if (!payload && !error) return <State message="Preparando el perfil…" spinning />;
  if (error || !payload) return <State message={error || "Página no disponible."} />;
  return <div className="min-h-screen bg-[#17110d] px-4 py-8 text-[#261d18] sm:px-6"><main className="mx-auto max-w-[620px] overflow-hidden rounded-[34px] bg-[#fffaf4] shadow-[0_35px_120px_rgba(0,0,0,0.48)]"><header className="bg-[linear-gradient(145deg,#f9eadb,#fffaf4)] px-6 pb-7 pt-9 text-center"><div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-white text-[#d86227] shadow"><MapPin size={28} /></div><h1 className="mt-5 text-4xl font-black tracking-tight">{payload.profile.displayName}</h1>{payload.profile.headline && <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#7e6758]">{payload.profile.headline}</p>}{payload.profile.locationName && <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[#ad7652]">{payload.profile.locationName}</p>}{payload.profile.address && <p className="mt-2 text-xs text-[#8b7262]">{payload.profile.address}</p>}</header><div className="space-y-3 px-4 py-6 sm:px-7">{payload.links.map((link) => <a className="flex items-center gap-3 rounded-2xl border border-[#eadfd5] bg-white px-4 py-4 font-bold shadow-sm transition hover:-translate-y-0.5" href={link.href} key={`${link.kind}-${link.sortOrder}`} rel="noreferrer" target="_blank"><span className="min-w-0 flex-1"><span className="block text-sm">{link.label || link.kind}</span><span className="mt-1 block truncate text-xs font-normal text-[#8a7262]">{link.href}</span></span><ExternalLink size={17} /></a>)}<button className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-extrabold text-[#9b5b36] hover:bg-[#f3e7dc]" onClick={() => void share()} type="button"><Share2 size={16} />{copied ? "Enlace copiado" : "Compartir esta página"}</button></div></main></div>;
}

function State({ message, spinning = false }: { message: string; spinning?: boolean }) { return <div className="grid min-h-screen place-items-center bg-[#17110d] px-6 text-center text-white"><div><Loader2 className={`mx-auto text-[#ef7d32] ${spinning ? "animate-spin" : ""}`} size={28} /><p className="mt-4 text-sm font-semibold text-white/68">{message}</p></div></div>; }
