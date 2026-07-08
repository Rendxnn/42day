import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { DeliveryCoverageSettings, UpdateDeliveryCoverageSettingsRequest } from "@42day/types";
import { AlertCircle, Check, Loader2, LocateFixed, MapPin, Save, Truck } from "lucide-react";
import { getDeliveryCoverageSettings, updateDeliveryCoverageSettings } from "../../api";

const DeliveryCoverageMap = lazy(async () => {
  const module = await import("./DeliveryCoverageMap");
  return { default: module.DeliveryCoverageMap };
});

type DeliveryCoverageViewProps = {
  locale: "en" | "es";
  tenantSlug: string;
  onNotify: (message: string) => void;
};

export function DeliveryCoverageSection({ locale, onNotify, tenantSlug }: DeliveryCoverageViewProps) {
  const [settings, setSettings] = useState<DeliveryCoverageSettings | null>(null);
  const [form, setForm] = useState<UpdateDeliveryCoverageSettingsRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getDeliveryCoverageSettings(tenantSlug)
      .then((next) => {
        if (!active) return;
        setSettings(next);
        setForm(toForm(next));
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : (locale === "en" ? "Coverage settings could not be loaded." : "No se pudo cargar la cobertura."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [locale, reloadKey, tenantSlug]);

  const coordinatesReady = form?.latitude !== undefined && form.longitude !== undefined;
  const changed = useMemo(() => Boolean(settings && form && JSON.stringify(form) !== JSON.stringify(toForm(settings))), [form, settings]);

  function patchForm(patch: Partial<UpdateDeliveryCoverageSettingsRequest>) {
    setForm((current) => current ? { ...current, ...patch } : current);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError(locale === "en" ? "This device does not support geolocation." : "Este dispositivo no permite obtener la ubicacion.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        patchForm({
          latitude: roundCoordinate(position.coords.latitude),
          longitude: roundCoordinate(position.coords.longitude),
        });
        setLocating(false);
      },
      (locationError) => {
        setError(locationError.code === locationError.PERMISSION_DENIED
          ? (locale === "en" ? "Location permission was denied." : "El permiso de ubicacion fue rechazado.")
          : (locale === "en" ? "Your current location could not be obtained." : "No se pudo obtener tu ubicacion actual."));
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
  }

  async function saveCoverage() {
    if (!form || !isValidForm(form)) {
      setError(locale === "en" ? "Check the coordinates, radius, and automatic messages." : "Revisa las coordenadas, el radio y los mensajes automaticos.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await updateDeliveryCoverageSettings(tenantSlug, form);
      setSettings(updated);
      setForm(toForm(updated));
      onNotify(locale === "en" ? "Delivery coverage saved." : "Cobertura de domicilios guardada.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : (locale === "en" ? "Coverage could not be saved." : "No se pudo guardar la cobertura."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <CoverageState icon={<Loader2 className="animate-spin" size={20} />} text={locale === "en" ? "Loading coverage..." : "Cargando cobertura..."} />;
  }

  if (!form) {
    return (
      <CoverageState
        action={
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-[14px] bg-[var(--text-strong)] px-4 text-sm font-semibold text-white"
            onClick={() => setReloadKey((current) => current + 1)}
            type="button"
          >
            {locale === "en" ? "Try again" : "Intentar de nuevo"}
          </button>
        }
        icon={<AlertCircle size={20} />}
        text={formatCoverageLoadError(error, locale)}
      />
    );
  }

  return (
    <section className="app-panel overflow-hidden rounded-[22px] sm:rounded-[26px]">
      <header className="border-b border-[rgba(118,93,71,0.12)] px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">{locale === "en" ? "Delivery settings" : "Configuracion de domicilios"}</p>
            <h2 className="mt-2 text-xl font-semibold text-[var(--text-strong)] sm:text-2xl">{locale === "en" ? "Delivery coverage" : "Cobertura de domicilios"}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-soft)]">
              {locale === "en"
                ? "Define how far your restaurant delivers. ParaHoy validates the location customers send through WhatsApp."
                : "Define hasta donde recibe domicilios tu restaurante. ParaHoy validara automaticamente la ubicacion enviada por el cliente por WhatsApp."}
            </p>
          </div>
          <SwitchField
            checked={form.deliveryEnabled}
            label={locale === "en" ? "Enable delivery" : "Activar domicilios"}
            onChange={(deliveryEnabled) => patchForm({ deliveryEnabled })}
          />
        </div>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section className="min-w-0 border-b border-[rgba(118,93,71,0.12)] p-4 sm:p-6 lg:border-b-0 lg:border-r">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-strong)]">{locale === "en" ? "Coverage area" : "Zona de cobertura"}</h3>
              <p className="mt-1 text-sm text-[var(--text-soft)]">{locale === "en" ? "View the delivery radius around your restaurant." : "Visualiza el radio de domicilios alrededor de tu restaurante."}</p>
            </div>
            <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] border border-[rgba(118,93,71,0.14)] px-3 text-sm font-semibold text-[var(--text-strong)] transition hover:bg-white disabled:opacity-60" disabled={locating} onClick={useCurrentLocation} type="button">
              {locating ? <Loader2 className="animate-spin" size={16} /> : <LocateFixed size={16} />}
              {locale === "en" ? "Use my location" : "Usar mi ubicacion actual"}
            </button>
          </div>

          <div className="mt-5">
            {coordinatesReady ? (
              <Suspense fallback={<div className="grid min-h-[320px] place-items-center rounded-[18px] bg-[var(--surface-base)]"><Loader2 className="animate-spin text-[var(--text-soft)]" size={22} /></div>}>
                <DeliveryCoverageMap
                  latitude={form.latitude!}
                  longitude={form.longitude!}
                  onLocationChange={(latitude, longitude) => patchForm({ latitude, longitude })}
                  radiusKm={form.deliveryRadiusKm}
                />
              </Suspense>
            ) : (
              <div className="grid min-h-[320px] place-items-center rounded-[18px] border border-dashed border-[rgba(118,93,71,0.22)] bg-[var(--surface-base)] px-5 text-center">
                <div>
                  <MapPin className="mx-auto text-[var(--text-faint)]" size={28} />
                  <p className="mt-3 text-sm font-semibold text-[var(--text-strong)]">{locale === "en" ? "Set your restaurant location to view coverage." : "Configura la ubicacion de tu restaurante para visualizar la cobertura."}</p>
                  <button className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-[var(--text-strong)] px-4 text-sm font-semibold text-white" onClick={useCurrentLocation} type="button"><LocateFixed size={16} />{locale === "en" ? "Use my location" : "Usar mi ubicacion actual"}</button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-[16px] bg-[rgba(79,122,97,0.09)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-[var(--success)]">{locale === "en" ? "Current radius" : "Radio actual"}: {formatRadius(form.deliveryRadiusKm)} km</p>
            <p className="text-xs text-[var(--text-soft)]">{locale === "en" ? "Straight-line distance from the restaurant" : "Distancia en linea recta desde el restaurante"}</p>
          </div>
        </section>

        <section className="min-w-0 p-4 sm:p-6">
          <h3 className="text-base font-semibold text-[var(--text-strong)]">{locale === "en" ? "Restaurant location" : "Ubicacion del restaurante"}</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--text-soft)]">{locale === "en" ? "For greater accuracy, use your current location while physically at the restaurant." : "Para mayor precision, usa tu ubicacion actual estando fisicamente en el restaurante."}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <NumberField label={locale === "en" ? "Latitude" : "Latitud"} max={90} min={-90} onChange={(latitude) => patchForm({ latitude })} value={form.latitude} />
            <NumberField label={locale === "en" ? "Longitude" : "Longitud"} max={180} min={-180} onChange={(longitude) => patchForm({ longitude })} value={form.longitude} />
          </div>
          <div className="mt-3 space-y-3">
            <TextField label={locale === "en" ? "Main city" : "Ciudad principal"} onChange={(restaurantCity) => patchForm({ restaurantCity })} value={form.restaurantCity ?? ""} />
            <TextField label={locale === "en" ? "Department" : "Departamento"} onChange={(restaurantDepartment) => patchForm({ restaurantDepartment })} value={form.restaurantDepartment ?? ""} />
            <TextField label={locale === "en" ? "Country" : "Pais"} onChange={(restaurantCountry) => patchForm({ restaurantCountry })} value={form.restaurantCountry} />
          </div>

          <div className="mt-6 border-t border-[rgba(118,93,71,0.12)] pt-5">
            <label className="text-sm font-semibold text-[var(--text-strong)]" htmlFor="delivery-radius">{locale === "en" ? "How far do you deliver?" : "Hasta donde haces domicilios?"}</label>
            <div className="mt-2 flex items-center gap-2">
              <input id="delivery-radius" className="h-12 min-w-0 flex-1 rounded-[14px] border border-[rgba(118,93,71,0.16)] bg-white/80 px-3 text-sm font-semibold text-[var(--text-strong)] outline-none focus:border-[var(--success)]" max={30} min={0.1} onChange={(event) => patchForm({ deliveryRadiusKm: Number(event.target.value) })} step={0.1} type="number" value={form.deliveryRadiusKm} />
              <span className="shrink-0 text-xs font-semibold text-[var(--text-soft)]">km</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--text-soft)]">{locale === "en" ? "Calculated in a straight line. It does not represent road distance or travel time." : "Este radio se calcula en linea recta. No representa distancia por calles ni tiempo de viaje."}</p>
          </div>
        </section>
      </div>

      <section className="border-t border-[rgba(118,93,71,0.12)] px-4 py-5 sm:px-6">
        <div className="flex items-start gap-3 rounded-[16px] bg-[rgba(79,122,97,0.09)] px-4 py-4 text-sm leading-6 text-[var(--text-soft)]">
          <Truck className="mt-0.5 shrink-0 text-[var(--success)]" size={18} />
          <p>{locale === "en" ? "When a customer requests delivery, the AI asks for their WhatsApp location. Orders continue only when the location is inside the configured radius." : "Cuando un cliente pida domicilio, la IA le pedira su ubicacion por WhatsApp. El pedido continuara solo si la ubicacion esta dentro del radio configurado."}</p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <MessageField label={locale === "en" ? "Request location message" : "Mensaje para pedir ubicacion"} onChange={(requestLocationMessage) => patchForm({ requestLocationMessage })} value={form.requestLocationMessage} />
          <MessageField label={locale === "en" ? "Written address message" : "Mensaje para direccion escrita"} onChange={(writtenAddressFallbackMessage) => patchForm({ writtenAddressFallbackMessage })} value={form.writtenAddressFallbackMessage} />
          <MessageField label={locale === "en" ? "Out-of-coverage message" : "Mensaje fuera de cobertura"} onChange={(outOfCoverageMessage) => patchForm({ outOfCoverageMessage })} value={form.outOfCoverageMessage} />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <SwitchRow checked={form.allowWrittenAddressReference} description={locale === "en" ? "The written address is saved for the driver, but coverage still requires an exact location." : "La direccion se guarda para el domiciliario, pero la cobertura requiere ubicacion exacta."} label={locale === "en" ? "Allow written address as reference" : "Permitir direccion escrita como referencia"} onChange={(allowWrittenAddressReference) => patchForm({ allowWrittenAddressReference })} />
          <SwitchRow checked={form.tryGeocodeWrittenAddresses} description={locale === "en" ? "Keep this off for the MVP; written addresses can be ambiguous." : "Para el MVP se recomienda dejarlo apagado; las direcciones pueden ser ambiguas."} label={locale === "en" ? "Try to validate written addresses" : "Intentar validar direcciones escritas"} onChange={(tryGeocodeWrittenAddresses) => patchForm({ tryGeocodeWrittenAddresses })} />
        </div>
      </section>

      <footer className="sticky bottom-0 flex flex-col gap-3 border-t border-[rgba(118,93,71,0.12)] bg-[rgba(255,251,246,0.94)] px-4 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-h-5 text-sm text-[var(--warning)]">{error}</div>
        <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-[var(--text-strong)] px-5 text-sm font-semibold text-white transition hover:bg-[#312923] disabled:cursor-not-allowed disabled:opacity-50" disabled={saving || !changed} onClick={() => void saveCoverage()} type="button">
          {saving ? <Loader2 className="animate-spin" size={16} /> : changed ? <Save size={16} /> : <Check size={16} />}
          {saving ? (locale === "en" ? "Saving..." : "Guardando...") : changed ? (locale === "en" ? "Save coverage" : "Guardar cobertura") : (locale === "en" ? "Saved" : "Guardado")}
        </button>
      </footer>
    </section>
  );
}

function SwitchField({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-semibold text-[var(--text-strong)]"><input checked={checked} className="peer sr-only" onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span className="relative h-7 w-12 rounded-full bg-[rgba(118,93,71,0.2)] transition after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition peer-checked:bg-[var(--success)] peer-checked:after:translate-x-5" />{label}</label>;
}

function SwitchRow({ checked, description, label, onChange }: { checked: boolean; description: string; label: string; onChange: (checked: boolean) => void }) {
  return <label className="flex cursor-pointer items-start justify-between gap-4 rounded-[16px] border border-[rgba(118,93,71,0.12)] px-4 py-4"><span><span className="block text-sm font-semibold text-[var(--text-strong)]">{label}</span><span className="mt-1 block text-xs leading-5 text-[var(--text-soft)]">{description}</span></span><input checked={checked} className="mt-1 h-5 w-5 shrink-0 accent-[var(--success)]" onChange={(event) => onChange(event.target.checked)} type="checkbox" /></label>;
}

function NumberField({ label, max, min, onChange, value }: { label: string; max: number; min: number; onChange: (value?: number) => void; value?: number }) {
  return <label className="block text-xs font-semibold text-[var(--text-soft)]">{label}<input className="mt-1.5 h-11 w-full rounded-[13px] border border-[rgba(118,93,71,0.16)] bg-white/80 px-3 text-sm text-[var(--text-strong)] outline-none focus:border-[var(--success)]" max={max} min={min} onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} step="any" type="number" value={value ?? ""} /></label>;
}

function TextField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return <label className="block text-xs font-semibold text-[var(--text-soft)]">{label}<input className="mt-1.5 h-11 w-full rounded-[13px] border border-[rgba(118,93,71,0.16)] bg-white/80 px-3 text-sm text-[var(--text-strong)] outline-none focus:border-[var(--success)]" onChange={(event) => onChange(event.target.value)} type="text" value={value} /></label>;
}

function MessageField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return <label className="block text-xs font-semibold text-[var(--text-soft)]">{label}<textarea className="mt-2 min-h-32 w-full resize-y rounded-[14px] border border-[rgba(118,93,71,0.16)] bg-white/80 px-3 py-3 text-sm leading-6 text-[var(--text-strong)] outline-none focus:border-[var(--success)]" maxLength={1000} onChange={(event) => onChange(event.target.value)} value={value} /></label>;
}

function CoverageState({ action, icon, text }: { action?: ReactNode; icon: ReactNode; text: string }) {
  return <div className="app-panel grid min-h-[240px] place-items-center rounded-[22px] px-5 py-10 text-center sm:min-h-[300px]"><div className="flex max-w-md flex-col items-center gap-3 text-sm font-semibold leading-6 text-[var(--text-soft)]">{icon}<p>{text}</p>{action}</div></div>;
}

function formatCoverageLoadError(error: string, locale: "en" | "es") {
  const missingEndpoint = /not_found|404/i.test(error);
  if (missingEndpoint) {
    return locale === "en"
      ? "Delivery coverage is temporarily unavailable. The service needs to be updated before it can be configured."
      : "La cobertura de domicilios no esta disponible temporalmente. El servicio debe actualizarse antes de configurarla.";
  }
  return error || (locale === "en" ? "Coverage is unavailable." : "La cobertura no esta disponible.");
}

function toForm(settings: DeliveryCoverageSettings): UpdateDeliveryCoverageSettingsRequest {
  const { locationId: _locationId, ...form } = settings;
  return form;
}

function isValidForm(form: UpdateDeliveryCoverageSettingsRequest) {
  const latitudeValid = form.latitude === undefined || (Number.isFinite(form.latitude) && form.latitude >= -90 && form.latitude <= 90);
  const longitudeValid = form.longitude === undefined || (Number.isFinite(form.longitude) && form.longitude >= -180 && form.longitude <= 180);
  const coordinatesAreComplete = (form.latitude === undefined) === (form.longitude === undefined);
  return latitudeValid
    && longitudeValid
    && coordinatesAreComplete
    && Number.isFinite(form.deliveryRadiusKm)
    && form.deliveryRadiusKm > 0
    && form.deliveryRadiusKm <= 30
    && form.restaurantCountry.trim().length >= 2
    && form.requestLocationMessage.trim().length >= 10
    && form.writtenAddressFallbackMessage.trim().length >= 10
    && form.outOfCoverageMessage.trim().length >= 10;
}

function roundCoordinate(value: number) {
  return Math.round(value * 10_000_000) / 10_000_000;
}

function formatRadius(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
