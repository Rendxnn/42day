import type { CoverageValidationMethod, DeliveryCoverageSettings, UpdateDeliveryCoverageSettingsRequest } from "@42day/types";

export type DeliveryCoverageValidation = {
  isInsideCoverage: boolean;
  distanceKm: number;
  deliveryRadiusKm: number;
  validationMethod: "whatsapp_location";
  confidence: "high";
};

export class DeliveryCoverageConfigurationError extends Error {
  readonly code: "delivery_disabled" | "restaurant_location_missing" | "invalid_customer_location";

  constructor(code: "delivery_disabled" | "restaurant_location_missing" | "invalid_customer_location") {
    super(code);
    this.name = "DeliveryCoverageConfigurationError";
    this.code = code;
  }
}

export function haversineDistanceKm(restaurantLat: number, restaurantLng: number, customerLat: number, customerLng: number) {
  assertCoordinates(restaurantLat, restaurantLng);
  assertCoordinates(customerLat, customerLng);
  const earthRadiusKm = 6371.0088;
  const latitudeDelta = toRadians(customerLat - restaurantLat);
  const longitudeDelta = toRadians(customerLng - restaurantLng);
  const restaurantLatitude = toRadians(restaurantLat);
  const customerLatitude = toRadians(customerLat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(restaurantLatitude) * Math.cos(customerLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function evaluateDeliveryCoverage(settings: DeliveryCoverageSettings | undefined, customerLatitude: number, customerLongitude: number): DeliveryCoverageValidation {
  if (!isValidLatitude(customerLatitude) || !isValidLongitude(customerLongitude)) {
    throw new DeliveryCoverageConfigurationError("invalid_customer_location");
  }
  if (!settings?.deliveryEnabled) throw new DeliveryCoverageConfigurationError("delivery_disabled");
  if (settings.latitude === undefined || settings.longitude === undefined) {
    throw new DeliveryCoverageConfigurationError("restaurant_location_missing");
  }
  const distanceKm = haversineDistanceKm(settings.latitude, settings.longitude, customerLatitude, customerLongitude);
  return {
    isInsideCoverage: distanceKm <= settings.deliveryRadiusKm,
    distanceKm: Math.round(distanceKm * 100) / 100,
    deliveryRadiusKm: settings.deliveryRadiusKm,
    validationMethod: "whatsapp_location",
    confidence: "high",
  };
}

export function hasValidatedDeliveryCoverage(input: {
  coverageValidationMethod?: CoverageValidationMethod;
  isInsideDeliveryCoverage?: boolean;
}) {
  return input.isInsideDeliveryCoverage === true
    && (input.coverageValidationMethod === "whatsapp_location" || input.coverageValidationMethod === "geocoded_address");
}

export function isValidLatitude(value: number) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidDeliveryRadius(value: number) {
  return Number.isFinite(value) && value > 0 && value <= 30;
}

export function parseDeliveryCoverageSettingsUpdate(value: unknown): UpdateDeliveryCoverageSettingsRequest | undefined {
  if (!value || typeof value !== "object") return undefined;
  const body = value as Record<string, unknown>;
  const latitude = parseOptionalNumber(body.latitude);
  const longitude = parseOptionalNumber(body.longitude);
  const deliveryRadiusKm = Number(body.deliveryRadiusKm);
  const deliveryFeeFixed = Number(body.deliveryFeeFixed);
  const country = parseText(body.restaurantCountry, 2, 80);
  const requestLocationMessage = parseText(body.requestLocationMessage, 10, 1000);
  const writtenAddressFallbackMessage = parseText(body.writtenAddressFallbackMessage, 10, 1000);
  const outOfCoverageMessage = parseText(body.outOfCoverageMessage, 10, 1000);
  const coordinatesAreComplete = (latitude === undefined) === (longitude === undefined);
  if (
    typeof body.deliveryEnabled !== "boolean" || latitude === "invalid" || longitude === "invalid"
    || !coordinatesAreComplete
    || (latitude !== undefined && !isValidLatitude(latitude))
    || (longitude !== undefined && !isValidLongitude(longitude))
    || !isValidDeliveryRadius(deliveryRadiusKm)
    || !isValidDeliveryFee(deliveryFeeFixed)
    || typeof body.electronicBillingEnabled !== "boolean"
    || typeof body.allowWrittenAddressReference !== "boolean"
    || typeof body.tryGeocodeWrittenAddresses !== "boolean"
    || typeof body.allowOutOfCoverageOrders !== "boolean"
    || !country || !requestLocationMessage || !writtenAddressFallbackMessage || !outOfCoverageMessage
  ) return undefined;

  return {
    deliveryEnabled: body.deliveryEnabled,
    deliveryFeeFixed,
    electronicBillingEnabled: body.electronicBillingEnabled,
    latitude,
    longitude,
    restaurantCity: parseOptionalText(body.restaurantCity, 100),
    restaurantDepartment: parseOptionalText(body.restaurantDepartment, 100),
    restaurantCountry: country,
    deliveryRadiusKm,
    allowWrittenAddressReference: body.allowWrittenAddressReference,
    tryGeocodeWrittenAddresses: body.tryGeocodeWrittenAddresses,
    allowOutOfCoverageOrders: body.allowOutOfCoverageOrders,
    requestLocationMessage,
    writtenAddressFallbackMessage,
    outOfCoverageMessage,
  };
}

export function isValidDeliveryFee(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 1_000_000;
}

function assertCoordinates(latitude: number, longitude: number) {
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    throw new DeliveryCoverageConfigurationError("invalid_customer_location");
  }
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function parseOptionalNumber(value: unknown): number | undefined | "invalid" {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "invalid";
}

function parseText(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length >= minimum && normalized.length <= maximum ? normalized : undefined;
}

function parseOptionalText(value: unknown, maximum: number) {
  if (value === undefined || value === null || value === "") return undefined;
  return parseText(value, 1, maximum);
}
