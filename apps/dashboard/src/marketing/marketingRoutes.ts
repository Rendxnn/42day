export type PublicMarketingPage = "landing" | "about" | "privacy" | "terms";

const publicMarketingRoutes: Record<string, PublicMarketingPage> = {
  "/": "landing",
  "/acerca-de-nosotros": "about",
  "/politica-de-privacidad": "privacy",
  "/terminos-y-condiciones": "terms",
};

function normalizePathname(pathname: string) {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function resolvePublicMarketingPage(pathname: string): PublicMarketingPage | null {
  return publicMarketingRoutes[normalizePathname(pathname)] ?? null;
}

