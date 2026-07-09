import { Hono } from "hono";
import type { ApiBindings } from "../../../lib/bindings";
import { createSupabaseRestClient } from "../../../lib/supabase-rest";
import { processMenuFile } from "../../../modules/menu-upload/menuFileProcessor";
import type { DashboardVariables, TenantRow } from "../types";
import { arrayBufferToBase64, parseGeminiMenuProducts } from "../support/uploads";

export const uploadsDashboardRoutes = new Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>();

uploadsDashboardRoutes.post("/:tenantSlug/uploads/menu-image/analyze", async (c) => {
  const form = await c.req.parseBody();
  const file = form.file;

  if (!(file instanceof File)) {
    return c.json({ error: "image_file_required" }, 400);
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return c.json({ error: "unsupported_image_type" }, 400);
  }

  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "replace-me") {
    return c.json({ error: "gemini_not_configured" }, 500);
  }

  const imageBase64 = arrayBufferToBase64(await file.arrayBuffer());
  const prompt = [
    "Eres un extractor de menus de restaurante en Colombia. Tu prioridad es capturar nombre, precio, categoria y descripcion completa de cada plato.",
    "Lee la imagen y devuelve SOLO JSON valido, sin markdown.",
    "Extrae platos vendibles del menu con precio en COP.",
    "Si un precio tiene puntos o separadores, conviertelo a entero.",
    "Ignora encabezados, horarios, telefonos, redes sociales y textos decorativos.",
    "La descripcion es obligatoria cuando exista texto debajo o al lado del nombre del plato.",
    "Para desayunos, la descripcion suele ser la linea siguiente con ingredientes como arepa, huevos, cafe, queso, pan o frutas.",
    "Para almuerzos, conserva acompanamientos e ingredientes: entrada, principio, seco, carne, ensalada, papas, arroz, bebida, etc.",
    "Para adiciones, si no hay descripcion separada, usa el mismo nombre como descripcion corta.",
    "Clasifica category usando una de estas etiquetas cuando aplique: desayuno, almuerzo, adicion. Si no aplica, usa otra categoria corta en singular.",
    "No inventes ingredientes que no aparezcan. Si una descripcion continua en varias lineas, unelas en una sola frase.",
    "Si el precio dice 'segun pescado', 'segun peso' o similar y no hay numero, omite ese producto.",
    'Formato exacto: {"products":[{"name":"string","description":"string","basePrice":12345,"category":"string","confidence":0.9}]}',
    "Usa nombres cortos y claros. No dejes description vacio si la imagen muestra ingredientes o acompanamientos.",
    "Si no detectas platos, devuelve {\"products\":[]}.",
  ].join("\n");

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
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: file.type,
                data: imageBase64,
              },
            },
          ],
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
    console.error("gemini_menu_analysis_failed", { status: response.status, body: errorText.slice(0, 500) });
    if (response.status === 429) {
      return c.json({ error: "gemini_quota_exhausted" }, 429);
    }

    return c.json({ error: "gemini_menu_analysis_failed" }, 502);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  const products = parseGeminiMenuProducts(text);

  return c.json({ products });
});

uploadsDashboardRoutes.post("/:tenantSlug/uploads/product-image", async (c) => {
  const tenant = c.get("tenant");
  const form = await c.req.parseBody();
  const file = form.file;

  if (!(file instanceof File)) {
    return c.json({ error: "image_file_required" }, 400);
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return c.json({ error: "unsupported_image_type" }, 400);
  }

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `${tenant.slug}/products/${crypto.randomUUID()}.${extension}`;
  const upload = await createSupabaseRestClient(c.env).uploadObject({
    bucket: "product-images",
    path: storagePath,
    body: file,
    contentType: file.type,
  });

  return c.json({
    bucket: "product-images",
    path: upload.path,
    publicUrl: upload.publicUrl,
  });
});

uploadsDashboardRoutes.post("/:tenantSlug/uploads/menu-file/analyze", async (c) => {
  const form = await c.req.parseBody();
  const file = form.file;

  if (!(file instanceof File)) {
    return c.json({ error: "menu_file_required" }, 400);
  }

  try {
    const result = await processMenuFile({
      env: c.env,
      file,
    });

    return c.json(result);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "menu_file_analysis_failed";
    if (reason === "unsupported_menu_file_type") return c.json({ error: reason }, 415);
    if (reason === "gemini_not_configured") return c.json({ error: reason }, 500);
    if (reason === "gemini_quota_exhausted") return c.json({ error: reason }, 429);

    console.error("menu_file_analysis_failed", { reason });
    return c.json({ error: "menu_file_analysis_failed" }, 502);
  }
});
