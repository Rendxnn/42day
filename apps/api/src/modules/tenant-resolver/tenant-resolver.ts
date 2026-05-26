import type { NormalizedInboundMessage, Tenant } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { createSupabaseRestClient } from "../../lib/supabase-rest";

type TenantChannelRow = {
  tenant_id: string;
};

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  schema_name: string;
  status: "active" | "inactive" | "suspended";
  timezone: string;
  currency: string;
  automation_enabled: boolean;
};

export async function resolveTenantForInboundMessage(
  env: ApiBindings,
  message: NormalizedInboundMessage,
): Promise<Tenant | null> {
  const client = createSupabaseRestClient(env);
  const channels = await client.select<TenantChannelRow>({
    schema: "control",
    table: "tenant_channels",
    query: {
      select: "tenant_id",
      provider: "eq.whatsapp_cloud",
      phone_number_id: `eq.${message.phoneNumberId}`,
      status: "eq.active",
      limit: 1,
    },
  });

  const tenantId = channels[0]?.tenant_id;

  if (!tenantId) {
    return null;
  }

  const tenants = await client.select<TenantRow>({
    schema: "control",
    table: "tenants",
    query: {
      select: "id,name,slug,schema_name,status,timezone,currency,automation_enabled",
      id: `eq.${tenantId}`,
      status: "eq.active",
      limit: 1,
    },
  });

  const tenant = tenants[0];

  if (!tenant) {
    return null;
  }

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    schemaName: tenant.schema_name,
    status: tenant.status,
    timezone: tenant.timezone,
    currency: tenant.currency,
    automationEnabled: tenant.automation_enabled,
  };
}
