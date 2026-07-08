import type { DeliveryCoverageSettings } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { createSupabaseRestClient } from "../../lib/supabase-rest";
import { evaluateDeliveryCoverage } from "./logic";
import type { DeliveryCoverageValidation } from "./logic";

export {
  DeliveryCoverageConfigurationError,
  evaluateDeliveryCoverage,
  haversineDistanceKm,
  isValidDeliveryRadius,
  isValidLatitude,
  isValidLongitude,
  parseDeliveryCoverageSettingsUpdate,
} from "./logic";

export const DEFAULT_REQUEST_LOCATION_MESSAGE = "Perfecto. Para validar si tenemos cobertura, por favor envianos tu ubicacion actual usando el boton de ubicacion de WhatsApp.";
export const DEFAULT_WRITTEN_ADDRESS_FALLBACK_MESSAGE = "Para evitar errores con el domicilio, necesitamos validar tu ubicacion exacta. Por favor envianos tu ubicacion usando el boton de ubicacion de WhatsApp. Tambien guardaremos tu direccion escrita como referencia para el domiciliario.";
export const DEFAULT_OUT_OF_COVERAGE_MESSAGE = "Lo sentimos, por ahora no tenemos cobertura para tu ubicacion. Puedes recoger en el local.";

type DeliveryCoverageLocationRow = {
  id: string;
  delivery_enabled?: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
  restaurant_city?: string | null;
  restaurant_department?: string | null;
  restaurant_country?: string | null;
  delivery_radius_km?: number | null;
  allow_written_address_reference?: boolean | null;
  try_geocode_written_addresses?: boolean | null;
  allow_out_of_coverage_orders?: boolean | null;
  request_location_message?: string | null;
  written_address_fallback_message?: string | null;
  out_of_coverage_message?: string | null;
};

export async function getDeliveryCoverageSettings(input: {
  env: ApiBindings;
  schemaName: string;
  locationId?: string;
}): Promise<DeliveryCoverageSettings | undefined> {
  const [row] = await createSupabaseRestClient(input.env).select<DeliveryCoverageLocationRow>({
    schema: input.schemaName,
    table: "locations",
    query: {
      select: "id,delivery_enabled,latitude,longitude,restaurant_city,restaurant_department,restaurant_country,delivery_radius_km,allow_written_address_reference,try_geocode_written_addresses,allow_out_of_coverage_orders,request_location_message,written_address_fallback_message,out_of_coverage_message",
      ...(input.locationId ? { id: `eq.${input.locationId}` } : { is_active: "eq.true" }),
      limit: 1,
    },
  });
  return row ? mapDeliveryCoverageSettings(row) : undefined;
}

export async function validateDeliveryCoverageFromWhatsappLocation(input: {
  env: ApiBindings;
  schemaName: string;
  locationId?: string;
  customerLatitude: number;
  customerLongitude: number;
}): Promise<DeliveryCoverageValidation> {
  const settings = await getDeliveryCoverageSettings(input);
  return evaluateDeliveryCoverage(settings, input.customerLatitude, input.customerLongitude);
}

function mapDeliveryCoverageSettings(row: DeliveryCoverageLocationRow): DeliveryCoverageSettings {
  return {
    locationId: row.id,
    deliveryEnabled: row.delivery_enabled ?? true,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    restaurantCity: row.restaurant_city ?? undefined,
    restaurantDepartment: row.restaurant_department ?? undefined,
    restaurantCountry: row.restaurant_country?.trim() || "Colombia",
    deliveryRadiusKm: row.delivery_radius_km ?? 3,
    allowWrittenAddressReference: row.allow_written_address_reference ?? true,
    tryGeocodeWrittenAddresses: row.try_geocode_written_addresses ?? false,
    allowOutOfCoverageOrders: row.allow_out_of_coverage_orders ?? false,
    requestLocationMessage: row.request_location_message?.trim() || DEFAULT_REQUEST_LOCATION_MESSAGE,
    writtenAddressFallbackMessage: row.written_address_fallback_message?.trim() || DEFAULT_WRITTEN_ADDRESS_FALLBACK_MESSAGE,
    outOfCoverageMessage: row.out_of_coverage_message?.trim() || DEFAULT_OUT_OF_COVERAGE_MESSAGE,
  };
}
