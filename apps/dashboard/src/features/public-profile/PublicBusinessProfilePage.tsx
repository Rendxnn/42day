import { useEffect, useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import type { BusinessProfilePayload } from "@42day/types";
import { getPublicBusinessProfile } from "../../api";
import { BusinessProfileCard } from "./BusinessProfileCard";

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
  return <div><BusinessProfileCard profile={payload.profile} links={payload.links} /><div className="-mt-4 pb-5"><button className="mx-auto flex min-h-12 items-center gap-2 rounded-2xl px-5 text-sm font-bold opacity-70 hover:opacity-100" onClick={() => void share()} type="button"><Share2 size={16} />{copied ? "Enlace copiado" : "Compartir esta página"}</button></div></div>;
}

function State({ message, spinning = false }: { message: string; spinning?: boolean }) { return <div className="grid min-h-screen place-items-center bg-[#17110d] px-6 text-center text-white"><div><Loader2 className={`mx-auto text-[#ef7d32] ${spinning ? "animate-spin" : ""}`} size={28} /><p className="mt-4 text-sm font-semibold text-white/68">{message}</p></div></div>; }
