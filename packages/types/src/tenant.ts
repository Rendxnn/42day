export type TenantStatus = "active" | "inactive" | "suspended";

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
  status: TenantStatus;
  timezone: string;
  currency: string;
  automationEnabled: boolean;
};

export type AutomationSettings = {
  tenantId: string;
  tenantSlug: string;
  tenantAutomationEnabled: boolean;
  locationAutomationEnabled?: boolean;
};

export type DeliveryCoverageSettings = {
  locationId: string;
  deliveryEnabled: boolean;
  latitude?: number;
  longitude?: number;
  restaurantCity?: string;
  restaurantDepartment?: string;
  restaurantCountry: string;
  deliveryRadiusKm: number;
  allowWrittenAddressReference: boolean;
  tryGeocodeWrittenAddresses: boolean;
  allowOutOfCoverageOrders: boolean;
  requestLocationMessage: string;
  writtenAddressFallbackMessage: string;
  outOfCoverageMessage: string;
};

export type UpdateDeliveryCoverageSettingsRequest = Omit<DeliveryCoverageSettings, "locationId">;

export type TenantChannel = {
  id: string;
  tenantId: string;
  provider: "whatsapp_cloud";
  phoneNumberId: string;
  wabaId: string;
  displayPhoneNumber?: string;
  status: "active" | "inactive";
};
