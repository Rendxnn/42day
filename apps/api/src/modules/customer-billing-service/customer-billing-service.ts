import type { BillingType, CustomerBillingProfile, OrderBillingDetails } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { createSupabaseRestClient } from "../../lib/supabase-rest";

type CustomerBillingProfileRow = {
  id: string;
  customer_id: string;
  billing_type: BillingType;
  full_name?: string | null;
  billing_address?: string | null;
  legal_name?: string | null;
  tax_id?: string | null;
  email?: string | null;
  created_at: string;
  updated_at: string;
};

export type SaveCustomerBillingProfileInput = {
  env: ApiBindings;
  schemaName: string;
  customerId: string;
  billing: OrderBillingDetails;
};

export async function loadCustomerBillingProfiles(input: {
  env: ApiBindings;
  schemaName: string;
  customerId: string;
}): Promise<CustomerBillingProfile[]> {
  const rows = await createSupabaseRestClient(input.env).select<CustomerBillingProfileRow>({
    schema: input.schemaName,
    table: "customer_billing_profiles",
    query: {
      select: "id,customer_id,billing_type,full_name,billing_address,legal_name,tax_id,email,created_at,updated_at",
      customer_id: `eq.${input.customerId}`,
      order: "updated_at.desc",
      limit: 10,
    },
  }).catch(() => []);

  return rows.map(mapCustomerBillingProfile);
}

export async function saveCustomerBillingProfile(input: SaveCustomerBillingProfileInput): Promise<CustomerBillingProfile> {
  const billing = normalizeBilling(input.billing);
  const rows = await createSupabaseRestClient(input.env).upsert<CustomerBillingProfileRow>({
    schema: input.schemaName,
    table: "customer_billing_profiles",
    rows: {
      customer_id: input.customerId,
      billing_type: billing.type,
      full_name: billing.fullName ?? null,
      billing_address: billing.billingAddress ?? null,
      legal_name: billing.legalName ?? null,
      tax_id: billing.taxId ?? null,
      email: billing.email ?? null,
      updated_at: new Date().toISOString(),
    },
    onConflict: "customer_id,billing_type",
    returning: "representation",
  });

  const row = rows[0];
  if (!row) {
    throw new Error("customer_billing_profile.upsert_failed");
  }

  return mapCustomerBillingProfile(row);
}

export function toOrderBillingDetails(profile: CustomerBillingProfile): OrderBillingDetails {
  return {
    type: profile.type,
    profileId: profile.id,
    fullName: profile.fullName,
    billingAddress: profile.billingAddress,
    legalName: profile.legalName,
    taxId: profile.taxId,
    email: profile.email,
  };
}

function mapCustomerBillingProfile(row: CustomerBillingProfileRow): CustomerBillingProfile {
  return {
    id: row.id,
    customerId: row.customer_id,
    type: row.billing_type,
    fullName: row.full_name ?? undefined,
    billingAddress: row.billing_address ?? undefined,
    legalName: row.legal_name ?? undefined,
    taxId: row.tax_id ?? undefined,
    email: row.email ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeBilling(input: OrderBillingDetails): OrderBillingDetails {
  return {
    type: input.type,
    profileId: input.profileId,
    fullName: input.fullName?.trim() || undefined,
    billingAddress: input.billingAddress?.trim() || undefined,
    legalName: input.legalName?.trim() || undefined,
    taxId: input.taxId?.trim() || undefined,
    email: input.email?.trim() || undefined,
  };
}
