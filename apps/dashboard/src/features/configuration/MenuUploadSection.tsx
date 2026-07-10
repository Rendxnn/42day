import { useEffect, useId, useState } from "react";
import type { DragEvent } from "react";
import type { DetectedMenuProduct, MenuFileAnalysisPayload } from "../../api";
import { DashboardApiError } from "../../api";
import { Camera, Check, Loader2, SearchCheck, Trash2, UploadCloud } from "lucide-react";
import unicodeEmojiData from "emojibase-data/meta/unicode.json";

export function MenuUploadSection({
  onAnalyze,
  onCreateProducts,
  onNotify,
}: {
  onAnalyze: (file: File) => Promise<MenuFileAnalysisPayload>;
  onCreateProducts: (products: DetectedMenuProduct[]) => Promise<void>;
  onNotify: (message: string) => void;
}) {
  const [preview, setPreview] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [results, setResults] = useState<DetectedMenuProduct[]>([]);
  const [analysisMeta, setAnalysisMeta] = useState<MenuFileAnalysisPayload | null>(null);
  const [error, setError] = useState("");
  const selectedFileKind = selectedFile ? getUploadFileKind(selectedFile) : "";

  function updateDetectedProduct(index: number, patch: Partial<DetectedMenuProduct>) {
    setResults((current) => current.map((product, entryIndex) => (
      entryIndex === index ? { ...product, ...patch } : product
    )));
  }

  function removeDetectedProduct(index: number) {
    setResults((current) => current.filter((_, entryIndex) => entryIndex !== index));
  }

  function readFile(file?: File) {
    if (!file) return;
    if (!isSupportedMenuUploadFile(file)) {
      setError("Formato no soportado. Sube Excel, CSV, PDF, TXT o imagen.");
      return;
    }

    setSelectedFile(file);
    setPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : "");
    setResults([]);
    setAnalysisMeta(null);
    setError("");
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    readFile(event.dataTransfer.files?.[0]);
  }

  async function analyzeSelectedFile() {
    if (!selectedFile) return;
    setIsAnalyzing(true);
    setError("");
    try {
      const payload = await onAnalyze(selectedFile);
      setAnalysisMeta(payload);
      setResults(payload.products.map((product) => ({
        ...product,
        emoji: product.emoji || inferProductEmoji({
          name: product.name,
          description: product.description,
        }),
      })));
      onNotify(payload.products.length > 0 ? "Menu analizado" : "No se detectaron platos");
    } catch (analysisError) {
      setError(getMenuUploadErrorMessage(analysisError));
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function importResults() {
    const sanitizedResults = results
      .map((product) => ({
        ...product,
        name: product.name.trim(),
        description: product.description?.trim(),
        basePrice: Number(product.basePrice ?? 0),
        category: product.category?.trim(),
        emoji: product.emoji || inferProductEmoji({
          name: product.name,
          description: product.description,
        }),
        options: product.options,
        productType: product.productType,
      }))
      .filter((product) => product.name && product.basePrice >= 0);

    if (sanitizedResults.length === 0) {
      setError("No hay productos validos para confirmar. Revisa minimo el nombre de cada producto.");
      return;
    }

    setIsImporting(true);
    setError("");
    try {
      await onCreateProducts(sanitizedResults);
      setResults([]);
      onNotify("Productos agregados al catalogo");
    } catch {
      setError("No se pudieron guardar todos los productos detectados.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <section className="space-y-6 pt-2">
      <div className="pt-1">
        <h2 className="app-display text-[2.25rem] leading-none text-[var(--text-on-dark)] sm:text-[2.8rem]">Subida</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[rgba(246,236,223,0.68)] sm:text-[15px]">
          Excel, CSV, PDF, TXT o imagen.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_460px]">
        <label
          className="rounded-[26px] border border-[rgba(255,242,227,0.08)] bg-[rgba(255,248,240,0.06)] p-4 text-[var(--text-on-dark)] shadow-[0_18px_50px_rgba(0,0,0,0.16)] sm:p-6"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <input accept=".xlsx,.xls,.csv,.pdf,.txt,image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => readFile(event.target.files?.[0])} type="file" />
          <div className={`flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-[22px] border border-dashed border-[rgba(255,242,227,0.14)] px-4 text-center transition hover:border-[rgba(255,242,227,0.22)] sm:min-h-[340px] sm:px-6 ${preview ? "overflow-hidden bg-[rgba(255,248,240,0.04)]" : "bg-[rgba(255,248,240,0.04)]"}`}>
            {preview ? (
              <img alt="Preview del menu" className="h-full w-full rounded-[20px] object-cover" src={preview} />
            ) : selectedFile ? (
              <>
                <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-[rgba(255,248,240,0.12)]">
                  <UploadCloud size={26} />
                </div>
                <p className="text-xl font-extrabold">{selectedFile.name}</p>
                <p className="mt-3 rounded-full border border-[rgba(255,242,227,0.1)] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[rgba(246,236,223,0.6)]">
                  {selectedFileKind}
                </p>
              </>
            ) : (
              <>
                <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-[rgba(255,248,240,0.12)]">
                  <UploadCloud size={26} />
                </div>
                <p className="app-display text-[2rem] leading-none sm:text-[2.3rem]">Sube el archivo del menu</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[rgba(246,236,223,0.52)]">
                  {[".xlsx", ".xls", ".csv", ".pdf", ".txt"].map((format) => (
                    <span className="rounded-full border border-[rgba(255,242,227,0.1)] px-3 py-1.5" key={format}>{format}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </label>

        <div className="app-panel rounded-[26px] p-4 sm:p-5">
          {selectedFile && (
            <div className="mb-4 grid gap-2 rounded-[22px] bg-[var(--surface-base)] px-4 py-3 text-sm text-[var(--text-soft)]">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-[var(--text-strong)]">Archivo</span>
                <span className="truncate text-right">{selectedFile.name}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-[var(--text-strong)]">Formato detectado</span>
                <span>{selectedFileKind}</span>
              </div>
            </div>
          )}
          <button
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-4 text-sm font-semibold text-white transition hover:bg-[#312923] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!selectedFile || isAnalyzing}
            onClick={() => void analyzeSelectedFile()}
            type="button"
          >
            {isAnalyzing ? <Loader2 className="animate-spin" size={17} /> : <SearchCheck size={17} />}
            {isAnalyzing ? "Analizando menu" : "Analizar menu"}
          </button>
          {analysisMeta && (
            <div className="mt-3 rounded-[20px] border border-[rgba(118,93,71,0.1)] bg-[var(--surface-base)] px-4 py-3 text-sm text-[var(--text-soft)]">
              <p className="font-semibold text-[var(--text-strong)]">
                {analysisMeta.source === "ai" ? "Interpretado con IA" : "Interpretado deterministicamente"}
              </p>
              <p className="mt-1 text-xs">Formato: {analysisMeta.fileType.toUpperCase()}</p>
              {analysisMeta.warnings.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
                  {analysisMeta.warnings.slice(0, 3).map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}
            </div>
          )}
          {error && (
            <p className="mt-3 rounded-[20px] border border-[rgba(180,94,84,0.18)] bg-[rgba(190,110,95,0.08)] px-4 py-3 text-sm font-medium text-[#8c4e47]">
              {error}
            </p>
          )}
          <div className="mt-4 space-y-2">
            {results.length === 0 && (
              <div className="rounded-[22px] bg-[var(--surface-base)] px-4 py-8 text-center text-sm text-[var(--text-soft)]">
                <Camera className="mx-auto mb-3 text-[var(--text-faint)]" size={22} />
                Los productos apareceran aqui antes de guardar.
              </div>
            )}
            {results.length > 0 && (
              <div className="rounded-[22px] border border-[rgba(118,93,71,0.1)] bg-[var(--surface-base)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-strong)]">Productos detectados</p>
                    <p className="mt-1 text-xs text-[var(--text-faint)]">{results.length} productos detectados</p>
                  </div>
                </div>
              </div>
            )}
            {results.map((item, index) => (
              <div className="rounded-[22px] border border-[rgba(118,93,71,0.1)] bg-[var(--panel-strong)] p-3 sm:p-4" key={`${item.name}-${index}`}>
                <div className="grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_120px]">
                    <div className="self-end">
                      <CompactEmojiButton
                        description={item.description}
                        name={item.name}
                        onChange={(emoji) => updateDetectedProduct(index, { emoji })}
                        value={item.emoji}
                      />
                    </div>
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Producto</span>
                      <input
                        className="h-11 w-full rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[var(--surface-base)] px-3 text-sm font-semibold text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
                        onChange={(event) => updateDetectedProduct(index, { name: event.target.value })}
                        value={item.name}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Precio</span>
                      <input
                        className="h-11 w-full rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[var(--surface-base)] px-3 text-sm font-semibold text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
                        min="0"
                        onChange={(event) => updateDetectedProduct(index, { basePrice: Number(event.target.value) })}
                        type="number"
                        value={Number(item.basePrice ?? 0)}
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[170px_minmax(0,1fr)]">
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Categoria</span>
                      <CategorySelect
                        onChange={(category) => updateDetectedProduct(index, { category })}
                        value={item.category}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Descripcion</span>
                      <input
                        className="h-11 w-full rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
                        onChange={(event) => updateDetectedProduct(index, { description: event.target.value })}
                        placeholder="Descripcion corta para WhatsApp"
                        value={item.description ?? ""}
                      />
                    </label>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
                      {item.confidence !== undefined ? `Confianza ${Math.round(item.confidence * 100)}%` : "Producto detectado"}
                      {item.options && item.options.length > 0 ? ` · ${item.options.length} opcion${item.options.length === 1 ? "" : "es"}` : ""}
                    </p>
                    <button
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[rgba(180,94,84,0.18)] px-3 text-xs font-semibold text-[#8c4e47] transition hover:bg-[rgba(190,110,95,0.08)]"
                      onClick={() => removeDetectedProduct(index)}
                      type="button"
                    >
                      <Trash2 size={14} />
                      Quitar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {results.length > 0 && (
            <button
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[rgba(118,93,71,0.12)] bg-white/70 px-4 text-sm font-semibold text-[var(--text-strong)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isImporting}
              onClick={() => void importResults()}
              type="button"
            >
              {isImporting ? <Loader2 className="animate-spin" size={17} /> : <Check size={17} />}
              {isImporting ? "Guardando resultados" : "Confirmar productos"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function isSupportedMenuUploadFile(file: File) {
  return /\.(xlsx|xls|csv|pdf|txt)$/i.test(file.name) || /^image\/(jpeg|png|webp)$/.test(file.type);
}

function getUploadFileKind(file: File) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "Excel";
  if (name.endsWith(".csv")) return "CSV";
  if (name.endsWith(".pdf")) return "PDF";
  if (name.endsWith(".txt")) return "Texto plano";
  if (file.type.startsWith("image/")) return "Imagen";
  return "Archivo";
}

function getMenuUploadErrorMessage(error: unknown) {
  if (error instanceof DashboardApiError) {
    if (error.backendError === "gemini_quota_exhausted") return "Gemini no tiene creditos disponibles para interpretar este archivo.";
    if (error.backendError === "gemini_not_configured") return "Gemini no esta configurado para interpretar archivos ambiguos.";
    if (error.backendError === "unsupported_menu_file_type") return "Formato no soportado. Sube Excel, CSV, PDF, TXT o imagen.";
    if (error.backendError === "menu_file_required") return "Selecciona un archivo de menu antes de analizar.";
  }

  return "No se pudo analizar el archivo. Revisa el formato o intenta con otro documento.";
}

function normalizeSearchText(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inferProductEmoji(input: Pick<DetectedMenuProduct, "description" | "name">) {
  const text = normalizeSearchText(`${input.name} ${input.description ?? ""}`);
  const matchedRule = foodEmojiRules.find((rule) => rule.terms.some((term) => text.includes(normalizeSearchText(term))));

  if (matchedRule) return matchedRule.emoji;

  return "🍽️";
}

function CategorySelect({
  onChange,
  value,
}: {
  onChange: (nextCategory: string) => void;
  value?: string;
}) {
  const listId = useId();
  const [draftValue, setDraftValue] = useState(value ?? "");
  const options = Array.from(new Set([value, "General", "Entradas", "Platos principales", "Adiciones", "Bebidas", "Postres"].filter((entry): entry is string => Boolean(entry?.trim()))));

  useEffect(() => {
    setDraftValue(value ?? "");
  }, [value]);

  function commit(nextValue = draftValue) {
    const normalized = nextValue.trim() || "General";
    setDraftValue(normalized);
    onChange(normalized);
  }

  return (
    <>
    <input
      className="h-11 rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[rgba(223,210,194,0.45)] px-3 text-sm font-semibold text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
      list={listId}
      onBlur={(event) => commit(event.target.value)}
      onChange={(event) => setDraftValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
      placeholder="Escribe o elige categoria"
      value={draftValue}
    />
    <datalist id={listId}>
      {options.map((option) => (
        <option key={option} value={option} />
      ))}
    </datalist>
    </>
  );
}

function CompactEmojiButton({
  description,
  name,
  onChange,
  value,
}: {
  description?: string;
  name: string;
  onChange: (emoji: string) => void;
  value?: string;
}) {
  const suggestedEmoji = inferProductEmoji({ description, name });
  const selectedEmoji = value || suggestedEmoji;
  const options = Array.from(new Set([selectedEmoji, suggestedEmoji, ...foodEmojiRules.map((rule) => rule.emoji), ...availableProductEmojis])).slice(0, 132);

  return (
    <details className="relative">
      <summary className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[var(--surface-base)] text-xl transition hover:bg-[var(--panel-strong)]">
        {selectedEmoji}
      </summary>
      <div className="absolute left-0 z-40 mt-2 w-[min(280px,calc(100vw-3rem))] rounded-[20px] border border-[rgba(118,93,71,0.14)] bg-[var(--panel-strong)] p-3 shadow-[0_18px_48px_rgba(20,14,10,0.2)]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">Emoji</span>
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--surface-base)] text-lg">{selectedEmoji}</span>
        </div>
        <div className="grid max-h-56 grid-cols-7 gap-1.5 overflow-y-auto pr-1 app-scrollbar">
          {options.map((emoji) => (
            <button
              aria-label={`Seleccionar emoji ${emoji}`}
              className={`grid h-9 place-items-center rounded-xl text-[1.15rem] transition ${
                selectedEmoji === emoji
                  ? "bg-[var(--text-strong)] shadow-[0_8px_18px_rgba(20,14,10,0.18)]"
                  : "bg-[var(--surface-base)] hover:bg-white"
              }`}
              key={`compact-button-option-${emoji}`}
              onClick={() => onChange(emoji)}
              type="button"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}

const foodEmojiRules: Array<{ emoji: string; terms: string[] }> = [
  { emoji: "☕", terms: ["cafe", "capuccino", "cappuccino", "espresso", "latte", "tinto", "mocca", "mocha"] },
  { emoji: "🥤", terms: ["gaseosa", "soda", "coca cola", "coca-cola", "pepsi", "limonada", "malteada"] },
  { emoji: "🧃", terms: ["jugo", "zumo", "guarapo", "chicha", "avena", "batido", "smoothie"] },
  { emoji: "🍺", terms: ["cerveza", "pola"] },
  { emoji: "🍷", terms: ["vino", "sangria"] },
  { emoji: "💧", terms: ["agua"] },
  { emoji: "🍵", terms: ["te", "aromatica", "infusion", "matcha"] },
  { emoji: "🥣", terms: ["sopa", "crema", "caldo", "consome", "ajiaco", "sancocho"] },
  { emoji: "🍳", terms: ["huevo", "omelette", "omelet", "perico", "desayuno"] },
  { emoji: "🥞", terms: ["pancake", "waffle", "hotcake"] },
  { emoji: "🥐", terms: ["croissant", "pan", "tostada", "sanduche", "sandwich"] },
  { emoji: "🍔", terms: ["hamburguesa", "burger"] },
  { emoji: "🍕", terms: ["pizza"] },
  { emoji: "🌮", terms: ["taco", "burrito", "quesadilla"] },
  { emoji: "🫓", terms: ["arepa"] },
  { emoji: "🥟", terms: ["empanada", "pastel", "pastelito"] },
  { emoji: "🍝", terms: ["pasta", "spaghetti", "espagueti", "lasagna", "lasana", "ravioli"] },
  { emoji: "🍚", terms: ["arroz", "chaufa", "risotto"] },
  { emoji: "🥩", terms: ["carne", "res", "bistec", "lomo", "churrasco", "costilla", "punta de anca"] },
  { emoji: "🍗", terms: ["pollo", "gallina", "alitas", "pechuga"] },
  { emoji: "🐟", terms: ["pescado", "tilapia", "salmon", "atun", "trucha", "mojarra"] },
  { emoji: "🦐", terms: ["camaron", "langostino", "mariscos", "ceviche"] },
  { emoji: "🐷", terms: ["cerdo", "tocino", "chicharron", "costilla de cerdo"] },
  { emoji: "🍟", terms: ["papa", "papas", "francesa", "criolla", "yuca", "patacon"] },
  { emoji: "🥗", terms: ["ensalada", "vegetariano", "vegetal", "verdura"] },
  { emoji: "🍰", terms: ["torta", "pastel", "postre", "cheesecake", "brownie"] },
  { emoji: "🍦", terms: ["helado", "gelato"] },
  { emoji: "🍌", terms: ["maduro", "platano"] },
  { emoji: "🥑", terms: ["aguacate"] },
  { emoji: "🫘", terms: ["frijol", "frijoles"] },
];

const availableProductEmojis = Array.from(new Set([
  ...foodEmojiRules.map((rule) => rule.emoji),
  "🍽️",
  "🥘",
  "🍛",
  "🥪",
  "🥛",
  "🍊",
  "🍓",
  "🍫",
  ...unicodeEmojiData,
]));
