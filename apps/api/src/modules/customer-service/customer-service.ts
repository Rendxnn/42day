import { createSupabaseRestClient } from "../../lib/supabase-rest";
import type { ApiBindings } from "../../lib/bindings";

export type CustomerRecord = {
  id: string;
  phone: string;
  name?: string;
  default_address?: string;
};

type CustomerRow = {
  id: string;
  phone: string;
  name?: string | null;
  default_address?: string | null;
};

export async function findOrCreateCustomer(input: {
  env: ApiBindings;
  schemaName: string;
  phone: string;
}): Promise<CustomerRecord> {
  const client = createSupabaseRestClient(input.env);
  const rows = await client.upsert<CustomerRow>({
    schema: input.schemaName,
    table: "customers",
    rows: {
      phone: input.phone,
    },
    onConflict: "phone",
    returning: "representation",
  });

  const customer = rows[0];

  if (!customer) {
    throw new Error("customer.upsert_failed");
  }

  return {
    id: customer.id,
    phone: customer.phone,
    name: customer.name ?? undefined,
    default_address: customer.default_address ?? undefined,
  };
}

