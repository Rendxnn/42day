import { BUSINESS_PROFILE_LIMITS } from "@42day/types";
import type { BusinessProfileLinkKind } from "@42day/types";

export function slugifyBusinessProfile(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export function normalizeBusinessProfilePhone(value: string) {
  const candidate = stripPhoneTransportPrefix(value);
  if (!candidate || !/^\+?[0-9\s().-]+$/.test(candidate)) throw new Error("business_profile_phone_invalid");
  if (candidate.includes("+") && !candidate.startsWith("+")) throw new Error("business_profile_phone_invalid");
  const digits = candidate.replace(/\D/g, "");
  if (digits.length < BUSINESS_PROFILE_LIMITS.phoneDigitsMin || digits.length > BUSINESS_PROFILE_LIMITS.phoneDigitsMax) {
    throw new Error("business_profile_phone_invalid");
  }
  return digits;
}

export function normalizeBusinessProfileLink(kind: BusinessProfileLinkKind, value: string) {
  if (kind === "phone") return `tel:+${normalizeBusinessProfilePhone(value)}`;
  if (kind === "whatsapp") return `https://wa.me/${normalizeBusinessProfilePhone(value)}`;
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("business_profile_link_href_invalid");
  return url.toString();
}

function stripPhoneTransportPrefix(value: string) {
  let candidate = value.trim();
  candidate = candidate.replace(/^tel:/i, "").replace(/^whatsapp:/i, "");
  candidate = candidate.replace(/^https:\/\/(?:www\.)?wa\.me\//i, "");
  candidate = candidate.replace(/^https:\/\/(?:www\.)?api\.whatsapp\.com\/send\?phone=/i, "");
  return candidate.replace(/\/$/, "").trim();
}
