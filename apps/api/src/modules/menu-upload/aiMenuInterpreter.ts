import type { ApiBindings } from "../../lib/bindings";
import type { MenuFileTypeInfo, ParsedMenu, RawMenuCategory } from "./types";

type AiMenuResponse = {
  categories?: RawMenuCategory[];
  products?: Array<{
    available?: boolean;
    category?: string;
    confidence?: number;
    currency?: string;
    description?: string;
    name?: string;
    options?: Array<{
      name: string;
      values: Array<{ name: string; price?: number }>;
    }>;
    price?: number;
  }>;
};

export async function interpretMenuWithAi(input: {
  env: ApiBindings;
  extractedText?: string;
  file?: File;
  fileType: MenuFileTypeInfo;
  previousWarnings?: string[];
}): Promise<ParsedMenu> {
  const apiKey = input.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "replace-me") {
    throw new Error("gemini_not_configured");
  }

  const parts: Array<Record<string, unknown>> = [{ text: buildPrompt(input.extractedText, input.previousWarnings) }];
  const canSendFile = input.file && (
    input.fileType.kind === "image"
    || input.fileType.kind === "pdf"
    || input.fileType.kind === "csv"
    || input.fileType.kind === "txt"
  );

  if (canSendFile && input.file) {
    parts.push({
      inline_data: {
        mime_type: input.fileType.mimeType,
        data: arrayBufferToBase64(await input.file.arrayBuffer()),
      },
    });
  }

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      generationConfig: {
        response_mime_type: "application/json",
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("gemini_menu_file_interpretation_failed", { status: response.status, body: errorText.slice(0, 500) });
    if (response.status === 429) throw new Error("gemini_quota_exhausted");
    throw new Error("gemini_menu_analysis_failed");
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  const parsed = parseAiJson(text);

  return {
    ambiguous: false,
    categories: parsed.categories,
    extractedText: input.extractedText,
    fileType: input.fileType.kind,
    parser: "aiMenuInterpreter",
    source: "ai",
    warnings: input.previousWarnings ?? [],
  };
}

function buildPrompt(extractedText?: string, previousWarnings: string[] = []): string {
  return [
    "Eres un extractor de menus de restaurante en Colombia.",
    "Devuelve SOLO JSON valido, sin markdown.",
    "Identifica categorias, productos, precios COP, descripciones, opciones, tamanos, toppings y variaciones.",
    "No inventes productos ni ingredientes. Si un precio dice segun peso o no hay numero, usa price 0.",
    "Si una fila tiene varios precios por tamano, crea options con name 'Tamano' y values con nombre/precio.",
    "Usa category 'Sin categoria' si no puedes inferirla.",
    "Estructura exacta:",
    '{"categories":[{"name":"Bebidas","items":[{"name":"Limonada natural","description":"Limonada fria con hielo","price":8000,"currency":"COP","options":[],"available":true,"confidence":0.9}]}]}',
    previousWarnings.length > 0 ? `Advertencias del parser deterministico: ${previousWarnings.join("; ")}` : "",
    extractedText ? `Texto/filas extraidas:\n${extractedText.slice(0, 14000)}` : "",
  ].filter(Boolean).join("\n\n");
}

function parseAiJson(text: string): { categories: RawMenuCategory[] } {
  const normalized = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(normalized) as AiMenuResponse;

  if (Array.isArray(parsed.categories)) {
    return {
      categories: parsed.categories.map((category) => ({
        name: String(category.name || "Sin categoria"),
        items: Array.isArray(category.items) ? category.items : [],
      })),
    };
  }

  if (Array.isArray(parsed.products)) {
    const categories = new Map<string, RawMenuCategory>();
    for (const product of parsed.products) {
      const categoryName = String(product.category || "Sin categoria");
      const category = categories.get(categoryName) ?? { name: categoryName, items: [] };
      category.items.push({
        available: product.available ?? true,
        category: categoryName,
        confidence: product.confidence,
        currency: product.currency || "COP",
        description: product.description,
        name: product.name,
        options: product.options,
        price: product.price,
      });
      categories.set(categoryName, category);
    }
    return { categories: [...categories.values()] };
  }

  return { categories: [] };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}
