import type { BusinessProfileLinkKind } from "@42day/types";

export function slugifyBusinessProfile(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export function normalizeBusinessProfilePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) throw new Error("business_profile_phone_invalid");
  return digits;
}

export function normalizeBusinessProfileLink(kind: BusinessProfileLinkKind, value: string) {
  if (kind === "phone") return `tel:+${normalizeBusinessProfilePhone(value)}`;
  if (kind === "whatsapp") return `https://wa.me/${normalizeBusinessProfilePhone(value.replace(/^https:\/\/(?:wa\.me|api\.whatsapp\.com)\//i, "").replace(/\/$/, ""))}`;
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("business_profile_link_href_invalid");
  return url.toString();
}
