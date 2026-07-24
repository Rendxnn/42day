import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, Download, FileJson, Loader2, Save, Sparkles, Upload, X } from "lucide-react";
import type { RestaurantKnowledgeDocument, RestaurantKnowledgeSnapshot } from "@42day/types";
import { DashboardApiError, getRestaurantKnowledge, updateRestaurantKnowledge } from "../../api";

const EMPTY_DOCUMENT: RestaurantKnowledgeDocument = { version: 1 };

const TEMPLATE_DOCUMENT: RestaurantKnowledgeDocument = {
  version: 1,
  restaurant: {
    assistantName: "Anfitrión de la carta",
    voice: "cercana, alegre y conocedora de la cocina",
    highlights: ["Preparaciones hechas al momento"],
  },
  products: [
    {
      productName: "REEMPLAZA POR EL NOMBRE EXACTO DEL PRODUCTO",
      ingredients: ["ingrediente principal", "acompañamiento"],
      allergens: ["lácteos"],
      serves: { min: 3, max: 4 },
      spicyOptions: ["pedir con picante al gusto"],
      pairings: ["una bebida fría"],
      recommendations: ["Ideal para compartir"],
      bestseller: true,
    },
  ],
  faq: [
    {
      question: "¿Tienen opciones vegetarianas?",
      answer: "Cuéntame cuál plato estás mirando y reviso la información confirmada por el restaurante.",
    },
  ],
};

export function RestaurantKnowledgeSection({ tenantSlug }: { tenantSlug: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [snapshot, setSnapshot] = useState<RestaurantKnowledgeSnapshot | null>(null);
  const [draft, setDraft] = useState(serialize(EMPTY_DOCUMENT));
  const [sourceFileName, setSourceFileName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getRestaurantKnowledge(tenantSlug)
      .then((next) => {
        if (!active) return;
        setSnapshot(next);
        setDraft(serialize(next.document));
        setSourceFileName(next.sourceFileName ?? "");
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(formatLoadError(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [tenantSlug]);

  const changed = useMemo(() => draft !== serialize(snapshot?.document ?? EMPTY_DOCUMENT) || sourceFileName !== (snapshot?.sourceFileName ?? ""), [draft, snapshot, sourceFileName]);
  const knowledgeEntries = snapshot?.document.products?.length ?? 0;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setSuccess("");
    if (!file.name.toLowerCase().endsWith(".json") && file.type !== "application/json") {
      setError("Selecciona un archivo JSON (.json).");
      return;
    }
    if (file.size > 250_000) {
      setError("El archivo supera 250 KB. Mantén únicamente conocimiento útil para la carta.");
      return;
    }
    try {
      const document = JSON.parse(await file.text()) as RestaurantKnowledgeDocument;
      setDraft(serialize(document));
      setSourceFileName(file.name.slice(0, 180));
      setSuccess("Archivo cargado. Revisa el contenido y guárdalo para activar esta versión.");
    } catch {
      setError("No pude leer ese JSON. Revisa que el archivo tenga un formato válido.");
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const document = JSON.parse(draft) as RestaurantKnowledgeDocument;
      const next = await updateRestaurantKnowledge(tenantSlug, {
        document,
        sourceFileName: sourceFileName || "edicion-manual.json",
      });
      setSnapshot(next);
      setDraft(serialize(next.document));
      setSourceFileName(next.sourceFileName ?? "");
      setSuccess("Conocimiento guardado. El anfitrión de la carta ya usará esta versión.");
    } catch (requestError) {
      setError(formatSaveError(requestError));
    } finally {
      setSaving(false);
    }
  }

  function downloadTemplate() {
    const file = new Blob([serialize(TEMPLATE_DOCUMENT)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "conocimiento-carta-restaurante.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="app-panel overflow-hidden rounded-[22px] sm:rounded-[26px]">
      <header className="border-b border-[rgba(118,93,71,0.12)] px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">Carta digital</p>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${snapshot && snapshot.version > 0 ? "bg-[rgba(76,132,104,0.14)] text-[#3c785b]" : "bg-[rgba(143,110,81,0.12)] text-[var(--text-soft)]"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${snapshot && snapshot.version > 0 ? "bg-[#4c8468]" : "bg-[var(--text-faint)]"}`} />
                {snapshot && snapshot.version > 0 ? "Activo en la carta" : "Sin archivo cargado"}
              </span>
            </div>
            <h2 className="mt-2 flex items-center gap-2 text-xl font-semibold text-[var(--text-strong)] sm:text-2xl"><Bot size={21} /> Anfitrión de la carta</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-soft)]">
              Sube el conocimiento confirmado del restaurante. Este agente solo aparece en la carta digital para responder, recomendar y orientar; WhatsApp sigue siendo el único canal para tomar pedidos.
            </p>
          </div>
          <div className="rounded-[16px] border border-[rgba(118,93,71,0.12)] bg-white/55 px-4 py-3 text-sm text-[var(--text-soft)]">
            <p className="font-semibold text-[var(--text-strong)]">{knowledgeEntries} platos enriquecidos</p>
            <p className="mt-0.5 text-xs">Versión {snapshot?.version ?? 0}{snapshot?.updatedAt ? ` · ${formatUpdatedAt(snapshot.updatedAt)}` : ""}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <input accept="application/json,.json" className="hidden" onChange={(event) => void handleFile(event.target.files?.[0])} ref={inputRef} type="file" />
          <div className="flex flex-col gap-3 sm:flex-row">
            <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] bg-[var(--text-strong)] px-4 text-sm font-semibold text-white transition hover:opacity-90" onClick={() => inputRef.current?.click()} type="button">
              <Upload size={16} /> Cargar archivo JSON
            </button>
            <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] border border-[rgba(118,93,71,0.16)] bg-white/65 px-4 text-sm font-semibold text-[var(--text-strong)] transition hover:bg-white" onClick={downloadTemplate} type="button">
              <Download size={16} /> Descargar plantilla
            </button>
            {sourceFileName && (
              <span className="inline-flex min-h-11 items-center gap-2 rounded-[14px] border border-[rgba(118,93,71,0.10)] px-3 text-xs font-semibold text-[var(--text-soft)]"><FileJson size={15} /> {sourceFileName}</span>
            )}
          </div>

          <label className="mt-4 block">
            <span className="sr-only">Conocimiento del restaurante en JSON</span>
            <textarea
              className="app-scrollbar min-h-[360px] w-full rounded-[18px] border border-[rgba(118,93,71,0.16)] bg-[#1d1713] p-4 font-mono text-xs leading-6 text-[#f5eee6] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[rgba(201,123,82,0.12)]"
              onChange={(event) => setDraft(event.target.value)}
              spellCheck={false}
              value={draft}
            />
          </label>

          {error && <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-[#a65349]"><X className="mt-0.5 shrink-0" size={16} />{error}</p>}
          {success && <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-[#3c785b]"><Check className="mt-0.5 shrink-0" size={16} />{success}</p>}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-5 text-[var(--text-soft)]">Máximo 250 KB. Se valida contra los productos activos antes de guardar.</p>
            <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55" disabled={loading || saving || !changed} onClick={() => void save()} type="button">
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              {saving ? "Guardando…" : "Guardar conocimiento"}
            </button>
          </div>
        </div>

        <aside className="rounded-[20px] border border-[rgba(118,93,71,0.12)] bg-[rgba(247,241,232,0.72)] p-5">
          <div className="flex items-center gap-2 text-[var(--text-strong)]"><Sparkles size={17} className="text-[var(--accent)]" /><p className="text-sm font-semibold">Qué puede responder</p></div>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--text-soft)]">
            <li><strong className="text-[var(--text-strong)]">Porciones:</strong> min, max o una frase de servicio.</li>
            <li><strong className="text-[var(--text-strong)]">Alérgenos:</strong> solo los que el restaurante confirme.</li>
            <li><strong className="text-[var(--text-strong)]">Ingredientes:</strong> acompañamientos, picante y maridajes.</li>
            <li><strong className="text-[var(--text-strong)]">Recomendación:</strong> “más pedido” únicamente si marcas <code>bestseller</code>.</li>
          </ul>
          <div className="mt-5 rounded-[16px] bg-[#211a16] p-4 text-sm leading-6 text-[rgba(246,236,223,0.78)]">
            “Sii, ese plato es delicioso…”. El tono es natural, pero el agente nunca inventa datos ni toma pedidos aquí.
          </div>
        </aside>
      </div>
    </section>
  );
}

function serialize(document: RestaurantKnowledgeDocument) {
  return JSON.stringify(document, null, 2);
}

function formatLoadError(error: unknown) {
  if (error instanceof DashboardApiError && error.backendError === "forbidden") return "Solo un encargado puede gestionar el conocimiento de la carta.";
  return "No se pudo cargar el conocimiento de la carta. Intenta de nuevo.";
}

function formatSaveError(error: unknown) {
  if (error instanceof DashboardApiError) {
    if (error.backendError === "invalid_restaurant_knowledge_document") return "El JSON tiene campos o referencias inválidas. Revisa la plantilla y los nombres exactos de los productos activos.";
    if (error.backendError === "carta_concierge_document_too_large") return "El archivo supera el tamaño permitido.";
    if (error.backendError === "forbidden") return "Solo un encargado puede guardar este archivo.";
  }
  return "No se pudo guardar el conocimiento. Tus cambios siguen aquí para que puedas corregirlos.";
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
