import type { NormalizedInboundMessage, Tenant } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";

export async function resolveTenantForInboundMessage(
  env: ApiBindings,
  message: NormalizedInboundMessage,
): Promise<Tenant | null> {
  // MVP bootstrap: use the Meta demo phone number as tenant_demo.
  // Once Supabase is configured, this must query control.tenant_channels.
  if (message.phoneNumberId !== env.META_PHONE_NUMBER_ID) {
    return null;
  }

  return {
    id: "tenant_demo",
    name: "Tenant Demo",
    slug: "demo",
    schemaName: "tenant_demo",
    status: "active",
    timezone: "America/Bogota",
    currency: "COP",
    automationEnabled: true,
  };
}
