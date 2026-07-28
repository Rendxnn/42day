import { useEffect } from "react";

type MarketingMetadataProps = {
  description: string;
  locale: "en" | "es";
  pathname: string;
  title: string;
};

function ensureMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }

  Object.entries(attributes).forEach(([name, value]) => element?.setAttribute(name, value));
}

export function useMarketingMetadata({ description, locale, pathname, title }: MarketingMetadataProps) {
  useEffect(() => {
    const canonicalUrl = new URL(pathname, window.location.origin).toString();
    const imageUrl = new URL("/parahoy-logo.png", window.location.origin).toString();
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }

    document.title = title;
    document.documentElement.lang = locale;
    canonical.href = canonicalUrl;
    ensureMeta('meta[name="description"]', { name: "description", content: description });
    ensureMeta('meta[property="og:title"]', { property: "og:title", content: title });
    ensureMeta('meta[property="og:description"]', { property: "og:description", content: description });
    ensureMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
    ensureMeta('meta[property="og:url"]', { property: "og:url", content: canonicalUrl });
    ensureMeta('meta[property="og:image"]', { property: "og:image", content: imageUrl });
  }, [description, locale, pathname, title]);
}

