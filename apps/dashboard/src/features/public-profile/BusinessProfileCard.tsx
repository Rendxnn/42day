import { ExternalLink, Camera, Globe2, MapPin, MessageCircle, Phone, Star, Users } from "lucide-react";
import type { BusinessProfileAppearance, BusinessProfileLink, BusinessProfilePayload } from "@42day/types";
import { BUSINESS_PROFILE_DEFAULT_APPEARANCE } from "@42day/types";
import { businessProfileInitials } from "@42day/core";

type CardProfile = BusinessProfilePayload["profile"];
const iconByKind = { instagram: Camera, facebook: Users, google_review: Star, whatsapp: MessageCircle, phone: Phone, maps: MapPin, website: Globe2, menu: Globe2, tiktok: Globe2, survey: Star, custom: Globe2 } as const;
const brandColor: Partial<Record<BusinessProfileLink["kind"], string>> = { instagram: "#C13584", whatsapp: "#25D366", google_review: "#4285F4" };

export function BusinessProfileCard({ profile, links, preview = false }: { profile: CardProfile; links: BusinessProfilePayload["links"]; preview?: boolean }) {
  const appearance: BusinessProfileAppearance = profile.appearance ?? BUSINESS_PROFILE_DEFAULT_APPEARANCE;
  const initials = businessProfileInitials(profile.displayName);
  return <main className={`${preview ? "min-h-0 px-2 py-2" : "min-h-screen px-3 py-8 sm:px-6"}`} style={{ backgroundColor: appearance.backgroundColor, color: appearance.textColor }}>
    <section className="mx-auto w-full max-w-[560px] overflow-hidden rounded-[30px] shadow-[0_22px_70px_rgba(0,0,0,0.15)]" style={{ backgroundColor: appearance.cardColor }}>
      <header className={`${preview ? "px-3 pb-3 pt-4" : "px-6 pb-7 pt-8"} text-center`}>
        {profile.avatar?.url ? <img alt={profile.avatar.altText || profile.displayName} className={`${preview ? "h-16 w-16" : "h-24 w-24"} mx-auto rounded-full object-cover shadow-sm`} src={profile.avatar.url} /> : <div aria-label={`${profile.displayName} — ${initials}`} className={`${preview ? "h-16 w-16 text-lg" : "h-24 w-24 text-2xl"} mx-auto grid place-items-center rounded-full bg-black/5 font-black`}>{initials}</div>}
        <h1 className={`${preview ? "mt-2 text-xl" : "mt-4 text-3xl"} font-black tracking-tight`}>{profile.displayName}</h1>
        {profile.headline && <p className="mx-auto mt-2 max-w-sm text-sm leading-6 opacity-75">{profile.headline}</p>}
        {profile.locationName && <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] opacity-65">{profile.locationName}</p>}
        {profile.address && <p className="mt-2 text-xs opacity-65">{profile.address}</p>}
      </header>
      <div className={`${preview ? "space-y-2 px-3 pb-3" : "space-y-3 px-4 pb-6 sm:px-6"}`}>
        {links.map((link) => {
          const Icon = iconByKind[link.kind];
          const color = appearance.iconMode === "monochrome" ? appearance.iconColor : brandColor[link.kind] ?? appearance.iconColor;
          return <a aria-label={link.label || link.kind} className="flex min-h-12 items-center gap-3 rounded-2xl border border-black/10 px-4 py-3 transition hover:brightness-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href={link.href} key={`${link.kind}-${link.sortOrder}`} rel="noopener noreferrer" style={{ color: appearance.textColor, outlineColor: appearance.iconColor }} target={preview ? undefined : "_blank"}>
            <Icon aria-hidden="true" color={color} size={21} strokeWidth={2.3} />
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{link.label || link.kind}</span>
            {!preview && <ExternalLink aria-hidden="true" className="opacity-60" size={15} />}
          </a>;
        })}
      </div>
    </section>
  </main>;
}
