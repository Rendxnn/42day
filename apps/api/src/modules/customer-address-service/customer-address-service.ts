import type { NormalizedInboundMessage } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { createSupabaseRestClient } from "../../lib/supabase-rest";

export async function saveCustomerAddressFromWhatsAppLocation(input: {
  env: ApiBindings;
  schemaName: string;
  customerId: string;
  message: NormalizedInboundMessage;
}): Promise<void> {
  if (!input.message.location) {
    return;
  }

  const client = createSupabaseRestClient(input.env);
  const addressText =
    input.message.location.address ??
    input.message.location.name ??
    `Ubicacion compartida: ${input.message.location.latitude}, ${input.message.location.longitude}`;

  await client.insert({
    schema: input.schemaName,
    table: "customer_addresses",
    rows: {
      customer_id: input.customerId,
      label: "WhatsApp",
      address_text: addressText,
      latitude: input.message.location.latitude,
      longitude: input.message.location.longitude,
      raw_location_payload: input.message.raw,
      source: "whatsapp_location",
      is_default: true,
    },
  });
}
