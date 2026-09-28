import { BUSINESS_PROFILE_DEFAULT_APPEARANCE } from "@42day/types";
import type { BusinessProfileAppearance } from "@42day/types";

export function normalizeHexColor(value: string): string | undefined {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  return match ? `#${match[1]!.toUpperCase()}` : undefined;
}

export function relativeLuminance(hex: string): number {
  const normalized = normalizeHexColor(hex);
  if (!normalized) throw new Error("business_profile_color_invalid");
  const channels = [1, 3, 5].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function businessProfileInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/u).filter(Boolean).slice(0, 2);
  return words.map((word) => Array.from(word)[0]?.toLocaleUpperCase() ?? "").join("") || "?";
}

export function validateBusinessProfileAppearance(value: Partial<BusinessProfileAppearance> | undefined) {
  const appearance: BusinessProfileAppearance = { ...BUSINESS_PROFILE_DEFAULT_APPEARANCE, ...value };
  const normalized = [appearance.backgroundColor, appearance.cardColor, appearance.textColor, appearance.iconColor].map(normalizeHexColor);
  if (normalized.some((color) => !color) || !["brand", "monochrome"].includes(appearance.iconMode)) throw new Error("business_profile_appearance_invalid");
  appearance.backgroundColor = normalized[0]!;
  appearance.cardColor = normalized[1]!;
  appearance.textColor = normalized[2]!;
  appearance.iconColor = normalized[3]!;
  return { appearance, textContrast: contrastRatio(appearance.textColor, appearance.cardColor), iconContrast: contrastRatio(appearance.iconColor, appearance.cardColor) };
}

export function businessProfileAppearanceIsPublishable(value: Partial<BusinessProfileAppearance> | undefined) {
  const result = validateBusinessProfileAppearance(value);
  return result.textContrast >= 4.5 && (result.appearance.iconMode !== "monochrome" || result.iconContrast >= 3);
}
