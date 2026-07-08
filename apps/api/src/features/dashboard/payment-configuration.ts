import type { ApiBindings } from "../../lib/bindings";
import { SupabaseRestError, createSupabaseRestClient } from "../../lib/supabase-rest";
import type { LocationRow, PaymentAccountRow, PaymentQrRow, TenantRow } from "./types";

const PAYMENT_QR_BUCKET = "payment-qrs";

export const PAYMENT_CONFIGURATION_CONSTRAINTS = {
  maxActiveAccounts: 5 as const,
  maxActiveQrs: 1 as const,
};

export type PaymentConfigurationSnapshotResponse = {
  accounts: Array<{
    id: string;
    bankName: string;
    accountNumber: string;
    holderName: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  qrs: Array<{
    id: string;
    label: string;
    imageUrl: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  constraints: typeof PAYMENT_CONFIGURATION_CONSTRAINTS;
};

export type PaymentConfigurationHealthResponse = {
  hasActiveTransferMethod: boolean;
  activeAccountsCount: number;
  activeQrCount: number;
  hasActiveQr: boolean;
};

export type TransferPaymentConfiguration = {
  accounts: PaymentAccountRow[];
  activeQr?: PaymentQrRow;
};

export async function getPrimaryLocation(env: ApiBindings, tenant: Pick<TenantRow, "schema_name">): Promise<LocationRow | undefined> {
  const [location] = await createSupabaseRestClient(env).select<LocationRow>({
    schema: tenant.schema_name,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,pickup_enabled,delivery_enabled,automation_enabled,is_active",
      is_active: "eq.true",
      order: "created_at.asc",
      limit: 1,
    },
  });

  return location;
}

export async function loadPaymentConfiguration(
  env: ApiBindings,
  tenant: Pick<TenantRow, "schema_name">,
): Promise<PaymentConfigurationSnapshotResponse> {
  const location = await getPrimaryLocation(env, tenant);
  if (!location) {
    return {
      accounts: [],
      qrs: [],
      constraints: PAYMENT_CONFIGURATION_CONSTRAINTS,
    };
  }

  const [accounts, qrs] = await Promise.all([
    selectPaymentAccounts(env, tenant.schema_name, location.id),
    selectPaymentQrs(env, tenant.schema_name, location.id),
  ]);

  return {
    accounts: accounts.map(mapPaymentAccountResponse),
    qrs: qrs.map((qr) => mapPaymentQrResponse(env, qr)),
    constraints: PAYMENT_CONFIGURATION_CONSTRAINTS,
  };
}

export async function loadPaymentConfigurationHealth(
  env: ApiBindings,
  tenant: Pick<TenantRow, "schema_name">,
): Promise<PaymentConfigurationHealthResponse> {
  const location = await getPrimaryLocation(env, tenant);
  if (!location) {
    return {
      hasActiveTransferMethod: false,
      activeAccountsCount: 0,
      activeQrCount: 0,
      hasActiveQr: false,
    };
  }

  const transferConfiguration = await loadTransferConfigurationForLocation(env, tenant.schema_name, location.id);
  const activeAccountsCount = transferConfiguration.accounts.length;
  const activeQrCount = transferConfiguration.activeQr ? 1 : 0;

  return {
    hasActiveTransferMethod: activeAccountsCount > 0 || activeQrCount > 0,
    activeAccountsCount,
    activeQrCount,
    hasActiveQr: Boolean(transferConfiguration.activeQr),
  };
}

export async function loadTransferConfigurationForLocation(
  env: ApiBindings,
  schemaName: string,
  locationId: string,
): Promise<TransferPaymentConfiguration> {
  const [accounts, qrs] = await Promise.all([
    createSupabaseRestClient(env).select<PaymentAccountRow>({
      schema: schemaName,
      table: "payment_accounts",
      query: {
        select: "id,location_id,bank_name,account_number,holder_name,is_active,created_at,updated_at",
        location_id: `eq.${locationId}`,
        is_active: "eq.true",
        order: "created_at.asc",
        limit: 10,
      },
    }).catch((error) => {
      if (isMissingPaymentConfigurationTable(error)) return [];
      throw error;
    }),
    createSupabaseRestClient(env).select<PaymentQrRow>({
      schema: schemaName,
      table: "payment_qrs",
      query: {
        select: "id,location_id,label,storage_bucket,storage_path,mime_type,is_active,created_at,updated_at",
        location_id: `eq.${locationId}`,
        is_active: "eq.true",
        order: "created_at.desc",
        limit: 1,
      },
    }).catch((error) => {
      if (isMissingPaymentConfigurationTable(error)) return [];
      throw error;
    }),
  ]);

  return {
    accounts,
    activeQr: qrs[0],
  };
}

export async function createPaymentAccount(input: {
  env: ApiBindings;
  tenant: Pick<TenantRow, "schema_name">;
  locationId: string;
  bankName: string;
  accountNumber: string;
  holderName: string;
  isActive?: boolean;
}): Promise<void> {
  const now = new Date().toISOString();
  const client = createSupabaseRestClient(input.env);

  if (input.isActive) {
    await assertCanActivateAccount(input.env, input.tenant.schema_name, input.locationId);
  }

  await client.insert({
    schema: input.tenant.schema_name,
    table: "payment_accounts",
    rows: {
      location_id: input.locationId,
      bank_name: input.bankName.trim(),
      account_number: input.accountNumber.trim(),
      holder_name: input.holderName.trim(),
      is_active: input.isActive ?? false,
      created_at: now,
      updated_at: now,
    },
  });
}

export async function updatePaymentAccount(input: {
  env: ApiBindings;
  tenant: Pick<TenantRow, "schema_name">;
  accountId: string;
  bankName?: string;
  accountNumber?: string;
  holderName?: string;
  isActive?: boolean;
}): Promise<void> {
  const current = await requirePaymentAccount(input.env, input.tenant.schema_name, input.accountId);
  if (input.isActive === true && !current.is_active) {
    await assertCanActivateAccount(input.env, input.tenant.schema_name, current.location_id, current.id);
  }

  await createSupabaseRestClient(input.env).update({
    schema: input.tenant.schema_name,
    table: "payment_accounts",
    query: {
      id: `eq.${input.accountId}`,
    },
    values: {
      ...(input.bankName !== undefined ? { bank_name: input.bankName.trim() } : {}),
      ...(input.accountNumber !== undefined ? { account_number: input.accountNumber.trim() } : {}),
      ...(input.holderName !== undefined ? { holder_name: input.holderName.trim() } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      updated_at: new Date().toISOString(),
    },
  });
}

export async function deletePaymentAccount(input: {
  env: ApiBindings;
  tenant: Pick<TenantRow, "schema_name">;
  accountId: string;
}): Promise<void> {
  const account = await requirePaymentAccount(input.env, input.tenant.schema_name, input.accountId);
  if (account.is_active) {
    throw new Error("active_account_delete_forbidden");
  }

  await createSupabaseRestClient(input.env).delete({
    schema: input.tenant.schema_name,
    table: "payment_accounts",
    query: {
      id: `eq.${input.accountId}`,
    },
  });
}

export async function activatePaymentAccount(input: {
  env: ApiBindings;
  tenant: Pick<TenantRow, "schema_name">;
  locationId: string;
  accountId: string;
}): Promise<void> {
  await requirePaymentAccount(input.env, input.tenant.schema_name, input.accountId);
  await assertCanActivateAccount(input.env, input.tenant.schema_name, input.locationId, input.accountId);
  await createSupabaseRestClient(input.env).update({
    schema: input.tenant.schema_name,
    table: "payment_accounts",
    query: {
      id: `eq.${input.accountId}`,
    },
    values: {
      is_active: true,
      updated_at: new Date().toISOString(),
    },
  });
}

export async function deactivatePaymentAccount(input: {
  env: ApiBindings;
  tenant: Pick<TenantRow, "schema_name">;
  accountId: string;
}): Promise<void> {
  await requirePaymentAccount(input.env, input.tenant.schema_name, input.accountId);
  await createSupabaseRestClient(input.env).update({
    schema: input.tenant.schema_name,
    table: "payment_accounts",
    query: {
      id: `eq.${input.accountId}`,
    },
    values: {
      is_active: false,
      updated_at: new Date().toISOString(),
    },
  });
}

export async function createPaymentQr(input: {
  env: ApiBindings;
  tenant: Pick<TenantRow, "schema_name" | "slug">;
  locationId: string;
  label: string;
  file: File;
  isActive?: boolean;
}): Promise<void> {
  if (input.isActive) {
    await assertCanActivateQr(input.env, input.tenant.schema_name, input.locationId);
  }

  const extension = resolveImageExtension(input.file.type);
  const storagePath = `${input.tenant.slug}/payment-qrs/${input.locationId}/${crypto.randomUUID()}.${extension}`;
  const upload = await createSupabaseRestClient(input.env).uploadObject({
    bucket: PAYMENT_QR_BUCKET,
    path: storagePath,
    body: input.file,
    contentType: input.file.type,
  });

  const now = new Date().toISOString();
  await createSupabaseRestClient(input.env).insert({
    schema: input.tenant.schema_name,
    table: "payment_qrs",
    rows: {
      location_id: input.locationId,
      label: input.label.trim(),
      storage_bucket: PAYMENT_QR_BUCKET,
      storage_path: upload.path,
      mime_type: input.file.type,
      is_active: input.isActive ?? false,
      created_at: now,
      updated_at: now,
    },
  });
}

export async function updatePaymentQr(input: {
  env: ApiBindings;
  tenant: Pick<TenantRow, "schema_name" | "slug">;
  qrId: string;
  label?: string;
  file?: File;
}): Promise<void> {
  const current = await requirePaymentQr(input.env, input.tenant.schema_name, input.qrId);
  let nextStoragePath = current.storage_path;
  let nextMimeType = current.mime_type ?? undefined;
  let oldStoragePath: string | null = null;

  if (input.file) {
    const extension = resolveImageExtension(input.file.type);
    nextStoragePath = `${input.tenant.slug}/payment-qrs/${current.location_id}/${crypto.randomUUID()}.${extension}`;
    nextMimeType = input.file.type;
    oldStoragePath = current.storage_path;
    await createSupabaseRestClient(input.env).uploadObject({
      bucket: PAYMENT_QR_BUCKET,
      path: nextStoragePath,
      body: input.file,
      contentType: input.file.type,
    });
  }

  await createSupabaseRestClient(input.env).update({
    schema: input.tenant.schema_name,
    table: "payment_qrs",
    query: {
      id: `eq.${input.qrId}`,
    },
    values: {
      ...(input.label !== undefined ? { label: input.label.trim() } : {}),
      ...(input.file ? { storage_path: nextStoragePath, mime_type: nextMimeType } : {}),
      updated_at: new Date().toISOString(),
    },
  });

  if (oldStoragePath) {
    await createSupabaseRestClient(input.env).deleteObject({
      bucket: PAYMENT_QR_BUCKET,
      path: oldStoragePath,
    }).catch(() => undefined);
  }
}

export async function deletePaymentQr(input: {
  env: ApiBindings;
  tenant: Pick<TenantRow, "schema_name">;
  qrId: string;
}): Promise<void> {
  const qr = await requirePaymentQr(input.env, input.tenant.schema_name, input.qrId);
  if (qr.is_active) {
    throw new Error("active_qr_delete_forbidden");
  }

  await createSupabaseRestClient(input.env).delete({
    schema: input.tenant.schema_name,
    table: "payment_qrs",
    query: {
      id: `eq.${input.qrId}`,
    },
  });

  await createSupabaseRestClient(input.env).deleteObject({
    bucket: qr.storage_bucket,
    path: qr.storage_path,
  }).catch(() => undefined);
}

export async function activatePaymentQr(input: {
  env: ApiBindings;
  tenant: Pick<TenantRow, "schema_name">;
  qrId: string;
}): Promise<void> {
  const current = await requirePaymentQr(input.env, input.tenant.schema_name, input.qrId);
  await assertCanActivateQr(input.env, input.tenant.schema_name, current.location_id, input.qrId);
  await createSupabaseRestClient(input.env).update({
    schema: input.tenant.schema_name,
    table: "payment_qrs",
    query: {
      id: `eq.${input.qrId}`,
    },
    values: {
      is_active: true,
      updated_at: new Date().toISOString(),
    },
  });
}

export async function deactivatePaymentQr(input: {
  env: ApiBindings;
  tenant: Pick<TenantRow, "schema_name">;
  qrId: string;
}): Promise<void> {
  await requirePaymentQr(input.env, input.tenant.schema_name, input.qrId);
  await createSupabaseRestClient(input.env).update({
    schema: input.tenant.schema_name,
    table: "payment_qrs",
    query: {
      id: `eq.${input.qrId}`,
    },
    values: {
      is_active: false,
      updated_at: new Date().toISOString(),
    },
  });
}

export function mapPaymentAccountResponse(account: PaymentAccountRow) {
  return {
    id: account.id,
    bankName: account.bank_name,
    accountNumber: account.account_number,
    holderName: account.holder_name,
    isActive: account.is_active,
    createdAt: account.created_at,
    updatedAt: account.updated_at,
  };
}

export function mapPaymentQrResponse(env: ApiBindings, qr: PaymentQrRow) {
  return {
    id: qr.id,
    label: qr.label,
    imageUrl: buildPublicStorageUrl(env, qr.storage_bucket, qr.storage_path),
    isActive: qr.is_active,
    createdAt: qr.created_at,
    updatedAt: qr.updated_at,
  };
}

export function buildPublicStorageUrl(env: ApiBindings, bucket: string, path: string) {
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${encodedPath}`;
}

export function resolveImageExtension(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/jpeg") return "jpg";
  throw new Error("unsupported_qr_image_type");
}

async function selectPaymentAccounts(env: ApiBindings, schemaName: string, locationId: string) {
  return createSupabaseRestClient(env).select<PaymentAccountRow>({
    schema: schemaName,
    table: "payment_accounts",
    query: {
      select: "id,location_id,bank_name,account_number,holder_name,is_active,created_at,updated_at",
      location_id: `eq.${locationId}`,
      order: "created_at.desc",
      limit: 50,
    },
  }).catch((error) => {
    if (isMissingPaymentConfigurationTable(error)) return [];
    throw error;
  });
}

async function selectPaymentQrs(env: ApiBindings, schemaName: string, locationId: string) {
  return createSupabaseRestClient(env).select<PaymentQrRow>({
    schema: schemaName,
    table: "payment_qrs",
    query: {
      select: "id,location_id,label,storage_bucket,storage_path,mime_type,is_active,created_at,updated_at",
      location_id: `eq.${locationId}`,
      order: "created_at.desc",
      limit: 20,
    },
  }).catch((error) => {
    if (isMissingPaymentConfigurationTable(error)) return [];
    throw error;
  });
}

async function requirePaymentAccount(env: ApiBindings, schemaName: string, accountId: string) {
  const [account] = await createSupabaseRestClient(env).select<PaymentAccountRow>({
    schema: schemaName,
    table: "payment_accounts",
    query: {
      select: "id,location_id,bank_name,account_number,holder_name,is_active,created_at,updated_at",
      id: `eq.${accountId}`,
      limit: 1,
    },
  }).catch((error) => {
    if (isMissingPaymentConfigurationTable(error)) return [];
    throw error;
  });

  if (!account) {
    throw new Error("payment_account_not_found");
  }

  return account;
}

async function requirePaymentQr(env: ApiBindings, schemaName: string, qrId: string) {
  const [qr] = await createSupabaseRestClient(env).select<PaymentQrRow>({
    schema: schemaName,
    table: "payment_qrs",
    query: {
      select: "id,location_id,label,storage_bucket,storage_path,mime_type,is_active,created_at,updated_at",
      id: `eq.${qrId}`,
      limit: 1,
    },
  }).catch((error) => {
    if (isMissingPaymentConfigurationTable(error)) return [];
    throw error;
  });

  if (!qr) {
    throw new Error("payment_qr_not_found");
  }

  return qr;
}

async function assertCanActivateAccount(
  env: ApiBindings,
  schemaName: string,
  locationId: string,
  accountId?: string,
) {
  const accounts = await createSupabaseRestClient(env).select<Pick<PaymentAccountRow, "id">>({
    schema: schemaName,
    table: "payment_accounts",
    query: {
      select: "id",
      location_id: `eq.${locationId}`,
      is_active: "eq.true",
      ...(accountId ? { id: `neq.${accountId}` } : {}),
      limit: 6,
    },
  }).catch((error) => {
    if (isMissingPaymentConfigurationTable(error)) return [];
    throw error;
  });

  if (accounts.length >= PAYMENT_CONFIGURATION_CONSTRAINTS.maxActiveAccounts) {
    throw new Error("accounts_active_limit_reached");
  }
}

async function assertCanActivateQr(
  env: ApiBindings,
  schemaName: string,
  locationId: string,
  qrId?: string,
) {
  const qrs = await createSupabaseRestClient(env).select<Pick<PaymentQrRow, "id">>({
    schema: schemaName,
    table: "payment_qrs",
    query: {
      select: "id",
      location_id: `eq.${locationId}`,
      is_active: "eq.true",
      ...(qrId ? { id: `neq.${qrId}` } : {}),
      limit: 1,
    },
  }).catch((error) => {
    if (isMissingPaymentConfigurationTable(error)) return [];
    throw error;
  });

  if (qrs.length > 0) {
    throw new Error("payment_qr_active_conflict");
  }
}

function isMissingPaymentConfigurationTable(error: unknown) {
  return error instanceof SupabaseRestError
    && error.status === 404
    && (error.body.includes("payment_accounts") || error.body.includes("payment_qrs"));
}
