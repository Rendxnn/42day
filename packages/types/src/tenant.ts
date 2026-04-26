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

export type TenantChannel = {
  id: string;
  tenantId: string;
  provider: "whatsapp_cloud";
  phoneNumberId: string;
  wabaId: string;
  displayPhoneNumber?: string;
  status: "active" | "inactive";
};
