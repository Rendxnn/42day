import type { ApiBindings } from "../../lib/bindings";

export type GoogleMapsGeocodeResult = {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  confidence: "high" | "medium" | "low" | "failed";
  partialMatch: boolean;
};

type GoogleMapsGeocodingResponse = {
  results?: Array<{
    formatted_address?: string;
    partial_match?: boolean;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
      location_type?: string;
    };
  }>;
  status?: string;
};

export async function geocodeAddressWithGoogleMaps(input: {
  env: ApiBindings;
  addressText: string;
  city?: string;
  department?: string;
  country?: string;
}): Promise<GoogleMapsGeocodeResult | null> {
  const apiKey = input.env.GOOGLE_MAPS_GEOCODING_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const queryText = [
    input.addressText,
    input.city,
    input.department,
    input.country,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(", ");

  if (!queryText) {
    return null;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", queryText);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "es");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`google_maps_geocoding_http_${response.status}`);
  }

  const payload = await response.json() as GoogleMapsGeocodingResponse;
  if (payload.status !== "OK" || !payload.results || payload.results.length === 0) {
    return null;
  }

  const firstResult = payload.results[0];
  if (!firstResult) {
    return null;
  }

  const rawLatitude = firstResult.geometry?.location?.lat;
  const rawLongitude = firstResult.geometry?.location?.lng;
  if (!Number.isFinite(rawLatitude) || !Number.isFinite(rawLongitude)) {
    return null;
  }
  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);

  const partialMatch = firstResult.partial_match === true;
  const locationType = firstResult.geometry?.location_type ?? "";

  return {
    latitude,
    longitude,
    formattedAddress: firstResult.formatted_address?.trim() || queryText,
    confidence: resolveGeocodingConfidence(locationType, partialMatch),
    partialMatch,
  };
}

function resolveGeocodingConfidence(locationType: string, partialMatch: boolean): GoogleMapsGeocodeResult["confidence"] {
  if (locationType === "ROOFTOP" && !partialMatch) {
    return "high";
  }

  if (locationType === "RANGE_INTERPOLATED" && !partialMatch) {
    return "medium";
  }

  if (locationType === "GEOMETRIC_CENTER" || (!partialMatch && locationType === "APPROXIMATE")) {
    return "low";
  }

  return "failed";
}
