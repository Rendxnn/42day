import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type DashboardLocale = "en" | "es";

const DASHBOARD_LOCALE_STORAGE_KEY = "parahoy-dashboard-locale";

const DashboardLocaleContext = createContext<{
  locale: DashboardLocale;
  setLocale: (locale: DashboardLocale) => void;
} | null>(null);

function resolveInitialLocale(): DashboardLocale {
  if (typeof window === "undefined") return "es";

  const storedLocale = window.localStorage.getItem(DASHBOARD_LOCALE_STORAGE_KEY);
  if (storedLocale === "es" || storedLocale === "en") return storedLocale;

  return window.navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

export function DashboardLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<DashboardLocale>(() => resolveInitialLocale());

  useEffect(() => {
    window.localStorage.setItem(DASHBOARD_LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale]);

  return <DashboardLocaleContext.Provider value={value}>{children}</DashboardLocaleContext.Provider>;
}

export function useDashboardLocale() {
  const context = useContext(DashboardLocaleContext);
  if (!context) {
    throw new Error("useDashboardLocale must be used within DashboardLocaleProvider");
  }

  return context;
}

export function LanguageToggle({
  className = "",
  locale,
  onChange,
}: {
  className?: string;
  locale: DashboardLocale;
  onChange: (locale: DashboardLocale) => void;
}) {
  return (
    <div className={`inline-flex items-center gap-1 rounded-2xl border border-[rgba(255,242,227,0.12)] bg-[rgba(255,248,240,0.06)] p-1 ${className}`}>
      {(["es", "en"] as DashboardLocale[]).map((option) => (
        <button
          className={`rounded-[14px] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition ${
            locale === option
              ? "bg-[rgba(236,215,198,0.16)] text-[var(--text-on-dark)]"
              : "text-[rgba(246,236,223,0.54)] hover:text-[var(--text-on-dark)]"
          }`}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function formatDashboardPrice(locale: DashboardLocale, value: number | undefined) {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

export function formatDashboardDateTime(locale: DashboardLocale, value?: string) {
  if (!value) return locale === "en" ? "no date" : "sin fecha";

  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
