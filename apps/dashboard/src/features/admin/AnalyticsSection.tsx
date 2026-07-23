import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  calculateRestaurantAnalytics,
  DashboardApiError,
  listRestaurantAnalytics,
} from "../../api";
import type { AdminRestaurant, RestaurantAnalyticsPayload, RestaurantAnalyticsSnapshot } from "../../api";

type AnalyticsSectionProps = {
  locale: "es" | "en";
  restaurants: AdminRestaurant[];
  selectedRestaurant?: AdminRestaurant;
};

type PeriodPreset = "today" | "7d" | "30d" | "custom";

function formatDateInput(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function getPresetRange(preset: Exclude<PeriodPreset, "custom">, timezone: string) {
  const endDate = formatDateInput(new Date(), timezone);
  const days = preset === "today" ? 0 : preset === "7d" ? 6 : 29;
  return { startDate: addDays(endDate, -days), endDate };
}

function getInitialRange(timezone: string) {
  const params = new URLSearchParams(window.location.search);
  const startDate = params.get("analyticsStart");
  const endDate = params.get("analyticsEnd");
  if (startDate && endDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { preset: "custom" as const, startDate, endDate };
  }
  return { preset: "7d" as const, ...getPresetRange("7d", timezone) };
}

function formatNumber(value: number | null | undefined, locale: "es" | "en", options?: Intl.NumberFormatOptions) {
  if (value === null || value === undefined) return locale === "en" ? "No data" : "Sin dato";
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CO", options).format(value);
}

function formatCurrency(value: number | null | undefined, currency: string, locale: "es" | "en") {
  if (value === null || value === undefined) return locale === "en" ? "No data" : "Sin dato";
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number | null | undefined, locale: "es" | "en") {
  if (value === null || value === undefined) return locale === "en" ? "No data" : "Sin dato";
  return `${formatNumber(value, locale, { maximumFractionDigits: 1 })}%`;
}

function getSnapshotByRestaurant(snapshots: RestaurantAnalyticsSnapshot[], restaurantId?: string) {
  return snapshots.find((snapshot) => snapshot.tenantId === restaurantId);
}

function getAnalyticsError(error: unknown, locale: "es" | "en") {
  if (error instanceof DashboardApiError && error.backendError === "invalid_analytics_range") {
    return locale === "en" ? "Choose a valid period of up to 366 days." : "Elige un periodo valido de hasta 366 dias.";
  }
  return error instanceof Error
    ? error.message
    : (locale === "en" ? "Analytics could not be loaded." : "No se pudo cargar la analitica.");
}

export function AnalyticsSection({ locale, restaurants, selectedRestaurant }: AnalyticsSectionProps) {
  const timezone = selectedRestaurant?.timezone ?? "America/Bogota";
  const [range, setRange] = useState<{ preset: PeriodPreset; startDate: string; endDate: string }>(() => getInitialRange(timezone));
  const [snapshots, setSnapshots] = useState<RestaurantAnalyticsSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState("");

  const selectedSnapshot = useMemo(
    () => getSnapshotByRestaurant(snapshots, selectedRestaurant?.id),
    [selectedRestaurant?.id, snapshots],
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("analyticsStart", range.startDate);
    url.searchParams.set("analyticsEnd", range.endDate);
    window.history.replaceState({}, "", url);
  }, [range.endDate, range.startDate]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError("");
    void listRestaurantAnalytics(range.startDate, range.endDate)
      .then((result) => {
        if (!mounted) return;
        setSnapshots(result.snapshots);
      })
      .catch((loadError) => {
        if (!mounted) return;
        setError(getAnalyticsError(loadError, locale));
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [locale, range.endDate, range.startDate]);

  function setPreset(preset: Exclude<PeriodPreset, "custom">) {
    setRange({ preset, ...getPresetRange(preset, timezone) });
  }

  function setCustomRange(patch: Partial<Pick<typeof range, "startDate" | "endDate">>) {
    setRange((current) => ({ ...current, ...patch, preset: "custom" }));
  }

  async function calculateSelectedRestaurant() {
    if (!selectedRestaurant) return;
    setIsCalculating(true);
    setError("");
    try {
      const result = await calculateRestaurantAnalytics(selectedRestaurant.id, range.startDate, range.endDate);
      setSnapshots((current) => [
        result.snapshot,
        ...current.filter((snapshot) => snapshot.tenantId !== result.snapshot.tenantId),
      ]);
    } catch (calculateError) {
      setError(getAnalyticsError(calculateError, locale));
    } finally {
      setIsCalculating(false);
    }
  }

  const calculatedCount = snapshots.length;

  return (
    <section className="p-5 sm:p-6">
      <div className="flex flex-col gap-5 border-b border-[rgba(118,93,71,0.12)] pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">{locale === "en" ? "Restaurant intelligence" : "Inteligencia operativa"}</p>
          <h2 className="mt-2 text-2xl font-extrabold text-[var(--text-strong)]">{locale === "en" ? "Agent analytics" : "Analitica del agente"}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-soft)]">
            {locale === "en"
              ? "Snapshots are never calculated while browsing. Choose a period and explicitly calculate the selected restaurant."
              : "Los cortes nunca se calculan al navegar. Elige un periodo y calcula explicitamente el restaurante seleccionado."}
          </p>
        </div>
        <button
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-5 text-sm font-semibold text-white transition hover:bg-[#312923] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!selectedRestaurant || isCalculating}
          onClick={() => void calculateSelectedRestaurant()}
          type="button"
        >
          {isCalculating ? <Loader2 className="animate-spin" size={17} /> : <RefreshCw size={17} />}
          {locale === "en" ? "Calculate analytics for restaurant" : "Calcular analitica para restaurante"}
        </button>
      </div>

      <div className="mt-5 grid gap-3 rounded-[22px] border border-[rgba(118,93,71,0.1)] bg-[var(--surface-base)] p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FilterLabel label={locale === "en" ? "Restaurant" : "Restaurante"} value={selectedRestaurant?.name ?? (locale === "en" ? "Choose a restaurant" : "Elige un restaurante")} />
          <FilterLabel label={locale === "en" ? "Scope" : "Alcance"} value={locale === "en" ? "All locations" : "Todas las sedes"} />
          <label>
            <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">{locale === "en" ? "From" : "Desde"}</span>
            <input className="h-11 w-full rounded-xl border border-[rgba(118,93,71,0.14)] bg-white px-3 text-sm font-semibold text-[var(--text-strong)]" onChange={(event) => setCustomRange({ startDate: event.target.value })} type="date" value={range.startDate} />
          </label>
          <label>
            <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">{locale === "en" ? "To" : "Hasta"}</span>
            <input className="h-11 w-full rounded-xl border border-[rgba(118,93,71,0.14)] bg-white px-3 text-sm font-semibold text-[var(--text-strong)]" onChange={(event) => setCustomRange({ endDate: event.target.value })} type="date" value={range.endDate} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["today", "7d", "30d"] as const).map((preset) => (
            <button
              className={`h-10 rounded-xl px-3 text-xs font-bold transition ${range.preset === preset ? "bg-[var(--panel-strong)] text-[var(--text-strong)]" : "bg-white text-[var(--text-soft)] hover:bg-[rgba(236,222,205,0.8)]"}`}
              key={preset}
              onClick={() => setPreset(preset)}
              type="button"
            >
              {preset === "today" ? (locale === "en" ? "Today" : "Hoy") : preset === "7d" ? "7 dias" : "30 dias"}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mt-4 rounded-2xl border border-[rgba(180,94,84,0.2)] bg-[rgba(190,110,95,0.1)] px-4 py-3 text-sm font-semibold text-[#9a4b43]">{error}</div>}

      {isLoading ? (
        <div className="grid min-h-72 place-items-center rounded-[24px] border border-dashed border-[rgba(118,93,71,0.18)] bg-[rgba(255,251,246,0.45)]">
          <div className="text-center text-sm font-semibold text-[var(--text-soft)]"><Loader2 className="mx-auto mb-3 animate-spin" size={22} />{locale === "en" ? "Reading saved analytics…" : "Leyendo analitica guardada…"}</div>
        </div>
      ) : !selectedRestaurant ? (
        <EmptyAnalyticsState locale={locale} title={locale === "en" ? "Choose a restaurant" : "Elige un restaurante"} description={locale === "en" ? "Select a restaurant from the left-hand list to inspect its saved snapshot." : "Selecciona un restaurante de la lista para ver su corte guardado."} />
      ) : !selectedSnapshot ? (
        <EmptyAnalyticsState locale={locale} title={locale === "en" ? "No snapshot for this period" : "No hay corte para este periodo"} description={locale === "en" ? "No data has been calculated yet. Calculation only starts when you press the button above." : "Aun no se ha calculado informacion. El calculo solo inicia al presionar el boton superior."} />
      ) : (
        <AnalyticsReport locale={locale} restaurant={selectedRestaurant} snapshot={selectedSnapshot} />
      )}

      <ComparisonTable locale={locale} restaurants={restaurants} selectedRestaurantId={selectedRestaurant?.id} snapshots={snapshots} />
      <p className="mt-5 text-xs leading-5 text-[var(--text-faint)]">
        {locale === "en"
          ? `${calculatedCount} of ${restaurants.length} restaurants have a saved snapshot for this exact period. Values are calculated in each restaurant timezone.`
          : `${calculatedCount} de ${restaurants.length} restaurantes tienen un corte guardado para este periodo exacto. Los valores se calculan con la zona horaria de cada restaurante.`}
      </p>
    </section>
  );
}

function FilterLabel({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">{label}</p><p className="mt-2 truncate text-sm font-bold text-[var(--text-strong)]">{value}</p></div>;
}

function EmptyAnalyticsState({ locale, title, description }: { locale: "es" | "en"; title: string; description: string }) {
  return (
    <div className="mt-5 grid min-h-72 place-items-center rounded-[24px] border border-dashed border-[rgba(118,93,71,0.18)] bg-[rgba(255,251,246,0.45)] px-6 text-center">
      <div className="max-w-md"><BarChart3 className="mx-auto text-[var(--text-faint)]" size={28} /><h3 className="mt-4 text-xl font-bold text-[var(--text-strong)]">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">{description}</p><p className="mt-4 text-xs font-semibold text-[var(--text-faint)]">{locale === "en" ? "No automatic refresh or hidden calculation is running." : "No hay refresco automatico ni calculos ocultos en ejecucion."}</p></div>
    </div>
  );
}

function AnalyticsReport({ locale, restaurant, snapshot }: { locale: "es" | "en"; restaurant: AdminRestaurant; snapshot: RestaurantAnalyticsSnapshot }) {
  const data = snapshot.payload;
  const previous = snapshot.previousPayload;
  const currency = restaurant.currency || "COP";
  const maxFunnel = Math.max(1, ...data.funnel.items.map((item) => item.value));
  const maxBucket = Math.max(1, ...data.timing.completionBuckets.map((bucket) => bucket.value));

  return (
    <div className="mt-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[rgba(79,122,97,0.16)] bg-[rgba(79,122,97,0.08)] px-4 py-3 text-sm text-[var(--text-soft)]">
        <span className="inline-flex items-center gap-2 font-semibold text-[var(--success)]"><CheckCircle2 size={16} />{locale === "en" ? "Saved snapshot" : "Corte guardado"}</span>
        <span>{locale === "en" ? "Calculated" : "Calculado"}: {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: snapshot.timezone }).format(new Date(snapshot.calculatedAt))}</span>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={locale === "en" ? "Agent-served conversations" : "Conversaciones atendidas"} previous={previous.metrics.agentServedConversations} value={formatNumber(data.metrics.agentServedConversations, locale)} />
        <MetricCard label={locale === "en" ? "Purchase intent" : "Intención real de compra"} previous={previous.metrics.purchaseIntentConversations} value={formatNumber(data.metrics.purchaseIntentConversations, locale)} />
        <MetricCard label={locale === "en" ? "Agent-confirmed orders" : "Pedidos confirmados por agente"} previous={previous.metrics.agentConfirmedOrders} value={formatNumber(data.metrics.agentConfirmedOrders, locale)} />
        <MetricCard label={locale === "en" ? "Close rate" : "Tasa de cierre"} previous={previous.metrics.closeRatePercent} suffix="%" value={formatNumber(data.metrics.closeRatePercent, locale, { maximumFractionDigits: 1 })} />
        <MetricCard label={locale === "en" ? "Human intervention" : "Intervención humana"} previous={previous.metrics.humanInterventionConversations} value={formatNumber(data.metrics.humanInterventionConversations, locale)} />
        <MetricCard label={locale === "en" ? "First response" : "Primera respuesta"} previous={previous.metrics.averageFirstResponseMinutes} suffix=" min" value={formatNumber(data.metrics.averageFirstResponseMinutes, locale, { maximumFractionDigits: 1 })} />
        <MetricCard label={locale === "en" ? "Order completion" : "Completar pedido"} previous={previous.metrics.averageCompletionMinutes} suffix=" min" value={formatNumber(data.metrics.averageCompletionMinutes, locale, { maximumFractionDigits: 1 })} />
        <MetricCard label={locale === "en" ? "Total value" : "Valor total"} previous={previous.metrics.totalValue} value={formatCurrency(data.metrics.totalValue, currency, locale)} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[24px] border border-[rgba(118,93,71,0.1)] bg-[rgba(255,251,246,0.68)] p-5">
          <SectionHeading icon={<TrendingDown size={17} />} title={locale === "en" ? "Conversion funnel" : "Embudo de conversión"} />
          <div className="mt-5 space-y-4">
            {data.funnel.items.map((item, index) => <FunnelRow item={item} key={item.key} locale={locale} max={maxFunnel} previous={previous.funnel.items.find((entry) => entry.key === item.key)?.value} showLoss={index < data.funnel.items.length - 1} />)}
          </div>
        </article>
        <article className="rounded-[24px] border border-[rgba(118,93,71,0.1)] bg-[rgba(255,251,246,0.68)] p-5">
          <SectionHeading icon={<Clock3 size={17} />} title={locale === "en" ? "Time to complete order" : "Tiempo de cierre de pedido"} />
          <div className="mt-4 grid grid-cols-2 gap-3"><SmallStat label={locale === "en" ? "Under 5 min" : "Menos de 5 min"} value={formatPercent(data.timing.underFivePercent, locale)} /><SmallStat label={locale === "en" ? "Under 10 min" : "Menos de 10 min"} value={formatPercent(data.timing.underTenPercent, locale)} /></div>
          <div className="mt-5 space-y-3">{data.timing.completionBuckets.map((bucket) => <BarRow key={bucket.key} label={bucket.label} max={maxBucket} value={bucket.value} />)}</div>
          <p className="mt-5 text-xs leading-5 text-[var(--text-faint)]">{locale === "en" ? `${data.timing.completionSampleSize} order(s) with a measurable completion time.` : `${data.timing.completionSampleSize} pedido(s) con tiempo de cierre medible.`}</p>
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <article className="rounded-[24px] border border-[rgba(118,93,71,0.1)] bg-[rgba(255,251,246,0.68)] p-5"><SectionHeading icon={<CalendarDays size={17} />} title={locale === "en" ? "Demand activity" : "Actividad de demanda"} /><ActivityRows activity={data.activity.daily} locale={locale} /></article>
        <article className="rounded-[24px] border border-[rgba(118,93,71,0.1)] bg-[rgba(255,251,246,0.68)] p-5"><SectionHeading icon={<Users size={17} />} title={locale === "en" ? "Human intervention" : "Intervención humana"} /><InterventionSummary data={data} locale={locale} /></article>
        <article className="rounded-[24px] border border-[rgba(118,93,71,0.1)] bg-[rgba(255,251,246,0.68)] p-5"><SectionHeading icon={<AlertTriangle size={17} />} title={locale === "en" ? "Quality and abandonment" : "Calidad y abandono"} /><QualitySummary data={data} locale={locale} /></article>
      </section>

      <Findings data={data} locale={locale} />
      {data.limitations.length > 0 && <div className="rounded-[20px] border border-[rgba(197,123,87,0.18)] bg-[rgba(197,123,87,0.08)] p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--warning)]">{locale === "en" ? "Data scope" : "Alcance de los datos"}</p><ul className="mt-2 space-y-1 text-sm leading-6 text-[var(--text-soft)]">{data.limitations.map((limitation) => <li key={limitation}>• {limitation}</li>)}</ul></div>}
    </div>
  );
}

function MetricCard({ label, previous, suffix = "", value }: { label: string; previous: number | null | undefined; suffix?: string; value: string }) {
  return <article className="rounded-[20px] border border-[rgba(118,93,71,0.1)] bg-[rgba(255,251,246,0.72)] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">{label}</p><p className="mt-2 text-2xl font-extrabold text-[var(--text-strong)]">{value}{value === "Sin dato" || value === "No data" ? "" : suffix}</p><p className="mt-2 text-xs text-[var(--text-faint)]">Periodo anterior: {previous ?? "—"}{previous === null || previous === undefined ? "" : suffix}</p></article>;
}

function SectionHeading({ icon, title }: { icon: ReactNode; title: string }) { return <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-strong)]"><span className="text-[var(--accent)]">{icon}</span>{title}</div>; }
function SmallStat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-[var(--surface-base)] px-3 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">{label}</p><p className="mt-1 text-lg font-extrabold text-[var(--text-strong)]">{value}</p></div>; }
function BarRow({ label, max, value }: { label: string; max: number; value: number }) { return <div><div className="mb-1 flex justify-between text-xs font-semibold text-[var(--text-soft)]"><span>{label}</span><span>{value}</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--surface-base)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} /></div></div>; }

function FunnelRow({ item, locale, max, previous, showLoss }: { item: { key: string; label: string; value: number }; locale: "es" | "en"; max: number; previous?: number; showLoss: boolean }) {
  const loss = previous === undefined ? undefined : item.value - previous;
  return <div><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-[var(--text-strong)]">{item.label}</p><p className="text-sm font-extrabold text-[var(--text-strong)]">{item.value}</p></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--surface-base)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(item.value / max) * 100}%` }} /></div>{showLoss && <p className="mt-1 text-[11px] text-[var(--text-faint)]">{locale === "en" ? "Previous period" : "Periodo anterior"}: {previous ?? "—"}{loss !== undefined && <span className={loss >= 0 ? " text-[var(--success)]" : " text-[#9a4b43]"}> ({loss >= 0 ? "+" : ""}{loss})</span>}</p>}</div>;
}

function ActivityRows({ activity, locale }: { activity: RestaurantAnalyticsPayload["activity"]["daily"]; locale: "es" | "en" }) { if (activity.length === 0) return <p className="mt-6 text-sm text-[var(--text-soft)]">{locale === "en" ? "No confirmed orders in this snapshot." : "No hay pedidos confirmados en este corte."}</p>; const max = Math.max(1, ...activity.map((item) => item.value)); return <div className="mt-5 space-y-3">{activity.map((item) => <BarRow key={item.date} label={new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${item.date}T12:00:00Z`))} max={max} value={item.value} />)}</div>; }
function InterventionSummary({ data, locale }: { data: RestaurantAnalyticsPayload; locale: "es" | "en" }) { return <div className="mt-5"><div className="grid grid-cols-2 gap-3"><SmallStat label={locale === "en" ? "Conversations" : "Conversaciones"} value={String(data.humanIntervention.conversations)} /><SmallStat label={locale === "en" ? "Unresolved" : "Sin resolver"} value={String(data.humanIntervention.unresolved)} /></div><div className="mt-4 space-y-2">{data.humanIntervention.reasons.length ? data.humanIntervention.reasons.map((reason) => <div className="flex justify-between gap-3 text-xs" key={reason.key}><span className="capitalize text-[var(--text-soft)]">{reason.key.replaceAll("_", " ")}</span><b className="text-[var(--text-strong)]">{reason.value}</b></div>) : <p className="text-sm text-[var(--text-soft)]">{locale === "en" ? "No intervention alerts." : "Sin alertas de intervención."}</p>}</div></div>; }
function QualitySummary({ data, locale }: { data: RestaurantAnalyticsPayload; locale: "es" | "en" }) { return <div className="mt-5 space-y-3 text-sm"><InfoValue label={locale === "en" ? "No manual correction" : "Sin corrección manual"} value={data.quality.withoutManualCorrection} /><InfoValue label={locale === "en" ? "Restaurant corrections" : "Correcciones restaurante"} value={data.quality.restaurantCorrections} /><InfoValue label={locale === "en" ? "Availability issues" : "Problemas de disponibilidad"} value={data.quality.unavailableItemEvents} /><InfoValue label={locale === "en" ? "Abandoned drafts" : "Borradores abandonados"} value={data.abandonment.value} /><p className="border-t border-[rgba(118,93,71,0.1)] pt-3 text-xs leading-5 text-[var(--text-faint)]">{data.abandonment.note}</p></div>; }
function InfoValue({ label, value }: { label: string; value: number | null }) { return <div className="flex justify-between gap-4"><span className="text-[var(--text-soft)]">{label}</span><b className="text-[var(--text-strong)]">{value ?? "—"}</b></div>; }

function Findings({ data, locale }: { data: RestaurantAnalyticsPayload; locale: "es" | "en" }) {
  type Finding = { icon: ReactNode; text: string };
  const findingCandidates: Array<Finding | null> = [
    data.metrics.closeRatePercent !== null && data.metrics.closeRatePercent < 50 ? { icon: <TrendingDown size={16} />, text: locale === "en" ? "The close rate is below 50%; review the steps after purchase intent." : "La tasa de cierre es menor al 50%; revisa los pasos posteriores a la intención de compra." } : null,
    data.metrics.averageFirstResponseMinutes !== null && data.metrics.averageFirstResponseMinutes > 5 ? { icon: <Clock3 size={16} />, text: locale === "en" ? "Average first response exceeds five minutes." : "La primera respuesta promedio supera los cinco minutos." } : null,
    data.quality.unavailableItemEvents > 0 ? { icon: <AlertTriangle size={16} />, text: locale === "en" ? `${data.quality.unavailableItemEvents} availability incident(s) required restaurant correction.` : `${data.quality.unavailableItemEvents} incidente(s) de disponibilidad requirieron corrección del restaurante.` } : null,
    data.metrics.closeRatePercent !== null && data.metrics.closeRatePercent >= 50 && (data.metrics.averageFirstResponseMinutes ?? 999) <= 5 ? { icon: <Sparkles size={16} />, text: locale === "en" ? "The agent is closing intent with a fast first response in this period." : "El agente está cerrando la intención con una primera respuesta ágil en este periodo." } : null,
  ];
  const findings = findingCandidates.filter((finding): finding is Finding => finding !== null);
  return <section className="rounded-[24px] border border-[rgba(197,123,87,0.18)] bg-[rgba(197,123,87,0.08)] p-5"><SectionHeading icon={<Sparkles size={17} />} title={locale === "en" ? "Period findings" : "Hallazgos del periodo"} /><div className="mt-4 grid gap-3 md:grid-cols-2">{findings.length ? findings.map((finding) => <div className="flex gap-3 rounded-2xl bg-white/60 p-3 text-sm leading-6 text-[var(--text-soft)]" key={finding.text}><span className="mt-1 text-[var(--warning)]">{finding.icon}</span>{finding.text}</div>) : <p className="text-sm text-[var(--text-soft)]">{locale === "en" ? "There is not enough signal to produce a deterministic finding for this period." : "No hay suficiente señal para producir un hallazgo determinista en este periodo."}</p>}</div></section>;
}

function ComparisonTable({ locale, restaurants, selectedRestaurantId, snapshots }: { locale: "es" | "en"; restaurants: AdminRestaurant[]; selectedRestaurantId?: string; snapshots: RestaurantAnalyticsSnapshot[] }) {
  return <section className="mt-7 overflow-hidden rounded-[24px] border border-[rgba(118,93,71,0.1)]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(118,93,71,0.1)] bg-[rgba(255,251,246,0.65)] px-5 py-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">{locale === "en" ? "Restaurant comparison" : "Comparación de restaurantes"}</p><p className="mt-1 text-sm text-[var(--text-soft)]">{locale === "en" ? "Only saved snapshots are included." : "Solo se incluyen cortes ya calculados."}</p></div><BarChart3 className="text-[var(--text-faint)]" size={18} /></div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-[var(--surface-base)] text-[10px] uppercase tracking-[0.12em] text-[var(--text-faint)]"><tr><th className="px-5 py-3">{locale === "en" ? "Restaurant" : "Restaurante"}</th><th className="px-5 py-3">{locale === "en" ? "Orders" : "Pedidos"}</th><th className="px-5 py-3">{locale === "en" ? "Close rate" : "Cierre"}</th><th className="px-5 py-3">{locale === "en" ? "Response" : "Respuesta"}</th><th className="px-5 py-3">{locale === "en" ? "Status" : "Estado"}</th></tr></thead><tbody>{restaurants.map((restaurant) => { const snapshot = getSnapshotByRestaurant(snapshots, restaurant.id); return <tr className={`border-t border-[rgba(118,93,71,0.08)] ${restaurant.id === selectedRestaurantId ? "bg-[rgba(236,222,205,0.32)]" : "bg-white/50"}`} key={restaurant.id}><td className="px-5 py-4 font-bold text-[var(--text-strong)]">{restaurant.name}</td><td className="px-5 py-4 text-[var(--text-soft)]">{snapshot ? snapshot.payload.metrics.agentConfirmedOrders : "—"}</td><td className="px-5 py-4 text-[var(--text-soft)]">{snapshot ? formatPercent(snapshot.payload.metrics.closeRatePercent, locale) : "—"}</td><td className="px-5 py-4 text-[var(--text-soft)]">{snapshot ? snapshot.payload.metrics.averageFirstResponseMinutes === null ? "—" : `${snapshot.payload.metrics.averageFirstResponseMinutes} min` : "—"}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${snapshot ? "bg-[rgba(79,122,97,0.12)] text-[var(--success)]" : "bg-[rgba(118,93,71,0.1)] text-[var(--text-soft)]"}`}>{snapshot ? (locale === "en" ? "Calculated" : "Calculado") : (locale === "en" ? "Not calculated" : "Sin calcular")}</span></td></tr>; })}</tbody></table></div></section>;
}
