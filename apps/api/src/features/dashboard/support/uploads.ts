import type { GeminiMenuProduct } from "../types";

export function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

export function parseGeminiMenuProducts(text: string): GeminiMenuProduct[] {
  const normalized = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(normalized) as { products?: unknown[] };

  return (parsed.products ?? [])
    .map((entry) => {
      const product = entry as Partial<GeminiMenuProduct>;
      return {
        name: String(product.name ?? "").trim(),
        description: product.description ? String(product.description).trim() : undefined,
        basePrice: Number(product.basePrice ?? 0),
        category: product.category ? String(product.category).trim() : undefined,
        confidence: product.confidence === undefined ? undefined : Number(product.confidence),
      };
    })
    .filter((product) => product.name && Number.isFinite(product.basePrice) && product.basePrice > 0)
    .slice(0, 30);
}
