import type { NormalizedInboundMessage } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { createSupabaseRestClient } from "../../lib/supabase-rest";

export type CustomerAddress = {
  id: string;
  addressText: string;
  addressDetails?: string;
  latitude?: number;
  longitude?: number;
  source: "text" | "whatsapp_location" | "dashboard";
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type CustomerAddressRow = {
  id: string;
  address_text: string;
  address_details?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source: CustomerAddress["source"];
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export async function saveCustomerAddressFromWhatsAppLocation(input: {
  env: ApiBindings;
  schemaName: string;
  customerId: string;
  message: NormalizedInboundMessage;
  addressText?: string;
  addressDetails?: string;
}): Promise<CustomerAddress | null> {
  if (!input.message.location) {
    return null;
  }

  const client = createSupabaseRestClient(input.env);
  const addressText = input.addressText?.trim()
    || input.message.location.address
    || input.message.location.name
    || `Ubicacion compartida: ${input.message.location.latitude}, ${input.message.location.longitude}`;

  await unsetDefaultAddresses(client, input.schemaName, input.customerId);

  const [created] = await client.insertReturning<CustomerAddressRow>({
    schema: input.schemaName,
    table: "customer_addresses",
    rows: {
      customer_id: input.customerId,
      label: "WhatsApp",
      address_text: addressText,
      address_details: input.addressDetails?.trim() || null,
      latitude: input.message.location.latitude,
      longitude: input.message.location.longitude,
      raw_location_payload: input.message.raw,
      source: "whatsapp_location",
      is_default: true,
    },
  });

  await updateCustomerDefaultAddress(client, input.schemaName, input.customerId, addressText);
  return mapCustomerAddress(created);
}

export async function saveCustomerAddressFromText(input: {
  env: ApiBindings;
  schemaName: string;
  customerId: string;
  addressText: string;
  addressDetails?: string;
}): Promise<CustomerAddress> {
  const client = createSupabaseRestClient(input.env);
  const normalizedAddress = input.addressText.trim();

  await unsetDefaultAddresses(client, input.schemaName, input.customerId);

  const [created] = await client.insertReturning<CustomerAddressRow>({
    schema: input.schemaName,
    table: "customer_addresses",
    rows: {
      customer_id: input.customerId,
      label: "Direccion de entrega",
      address_text: normalizedAddress,
      address_details: input.addressDetails?.trim() || null,
      source: "text",
      is_default: true,
    },
  });

  await updateCustomerDefaultAddress(client, input.schemaName, input.customerId, normalizedAddress);
  return mapCustomerAddress(created);
}

export async function getLatestCustomerAddress(input: {
  env: ApiBindings;
  schemaName: string;
  customerId: string;
}): Promise<CustomerAddress | null> {
  const [row] = await createSupabaseRestClient(input.env).select<CustomerAddressRow>({
    schema: input.schemaName,
    table: "customer_addresses",
    query: {
      select: "id,address_text,address_details,latitude,longitude,source,is_default,created_at,updated_at",
      customer_id: `eq.${input.customerId}`,
      order: "is_default.desc,created_at.desc",
      limit: 1,
    },
  });

  return row ? mapCustomerAddress(row) : null;
}

async function unsetDefaultAddresses(
  client: ReturnType<typeof createSupabaseRestClient>,
  schemaName: string,
  customerId: string,
): Promise<void> {
  await client.update({
    schema: schemaName,
    table: "customer_addresses",
    values: {
      is_default: false,
      updated_at: new Date().toISOString(),
    },
    query: {
      customer_id: `eq.${customerId}`,
      is_default: "eq.true",
    },
  }).catch(() => undefined);
}

async function updateCustomerDefaultAddress(
  client: ReturnType<typeof createSupabaseRestClient>,
  schemaName: string,
  customerId: string,
  addressText: string,
): Promise<void> {
  await client.update({
    schema: schemaName,
    table: "customers",
    values: {
      default_address: addressText,
      updated_at: new Date().toISOString(),
    },
    query: {
      id: `eq.${customerId}`,
    },
  }).catch(() => undefined);
}

function mapCustomerAddress(row: CustomerAddressRow | undefined): CustomerAddress {
  if (!row) {
    throw new Error("customer_address.row_missing");
  }

  return {
    id: row.id,
    addressText: row.address_text,
    addressDetails: row.address_details?.trim() || undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    source: row.source,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
