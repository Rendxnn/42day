import type { PaymentConfigurationAdapter } from "./paymentConfiguration.adapter";
import type {
  CreatePaymentAccountInput,
  CreatePaymentQrInput,
  PaymentAccount,
  PaymentConfigurationSnapshot,
  PaymentQr,
  UpdatePaymentAccountInput,
  UpdatePaymentQrInput,
} from "./paymentConfiguration.types";

const DEFAULT_CONSTRAINTS = {
  maxActiveAccounts: 5 as const,
  maxActiveQrs: 1 as const,
};

const tenantSnapshots = new Map<string, PaymentConfigurationSnapshot>();

function createEmptySnapshot(): PaymentConfigurationSnapshot {
  return {
    accounts: [],
    qrs: [],
    constraints: DEFAULT_CONSTRAINTS,
  };
}

function cloneSnapshot(snapshot: PaymentConfigurationSnapshot): PaymentConfigurationSnapshot {
  return {
    constraints: { ...snapshot.constraints },
    accounts: snapshot.accounts.map((account) => ({ ...account })),
    qrs: snapshot.qrs.map((qr) => ({ ...qr })),
  };
}

function getTenantSnapshot(tenantSlug: string) {
  const existing = tenantSnapshots.get(tenantSlug);
  if (existing) {
    return existing;
  }

  const snapshot = createEmptySnapshot();
  tenantSnapshots.set(tenantSlug, snapshot);
  return snapshot;
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function countActiveAccounts(snapshot: PaymentConfigurationSnapshot) {
  return snapshot.accounts.filter((account) => account.isActive).length;
}

function countActiveQrs(snapshot: PaymentConfigurationSnapshot) {
  return snapshot.qrs.filter((qr) => qr.isActive).length;
}

function ensureAccount(snapshot: PaymentConfigurationSnapshot, accountId: string) {
  const account = snapshot.accounts.find((entry) => entry.id === accountId);
  if (!account) {
    throw new Error("payment_account_not_found");
  }

  return account;
}

function ensureQr(snapshot: PaymentConfigurationSnapshot, qrId: string) {
  const qr = snapshot.qrs.find((entry) => entry.id === qrId);
  if (!qr) {
    throw new Error("payment_qr_not_found");
  }

  return qr;
}

function assertCanActivateAccount(snapshot: PaymentConfigurationSnapshot, accountId?: string) {
  const activeCount = snapshot.accounts.filter((account) => account.isActive && account.id !== accountId).length;
  if (activeCount >= snapshot.constraints.maxActiveAccounts) {
    throw new Error("accounts_active_limit_reached");
  }
}

function assertCanActivateQr(snapshot: PaymentConfigurationSnapshot, qrId?: string) {
  const otherActiveQr = snapshot.qrs.find((qr) => qr.isActive && qr.id !== qrId);
  if (otherActiveQr) {
    throw new Error("payment_qr_active_conflict");
  }
}

async function createPaymentAccount(tenantSlug: string, input: CreatePaymentAccountInput) {
  const snapshot = getTenantSnapshot(tenantSlug);
  const now = new Date().toISOString();

  if (input.isActive) {
    assertCanActivateAccount(snapshot);
  }

  const nextAccount: PaymentAccount = {
    id: createId("account"),
    bankName: input.bankName.trim(),
    accountNumber: input.accountNumber.trim(),
    holderName: input.holderName.trim(),
    isActive: input.isActive ?? false,
    createdAt: now,
    updatedAt: now,
  };

  snapshot.accounts = [nextAccount, ...snapshot.accounts];
}

async function updatePaymentAccount(tenantSlug: string, accountId: string, input: UpdatePaymentAccountInput) {
  const snapshot = getTenantSnapshot(tenantSlug);
  const account = ensureAccount(snapshot, accountId);

  if (input.isActive === true && !account.isActive) {
    assertCanActivateAccount(snapshot, account.id);
  }

  Object.assign(account, {
    bankName: input.bankName !== undefined ? input.bankName.trim() : account.bankName,
    accountNumber: input.accountNumber !== undefined ? input.accountNumber.trim() : account.accountNumber,
    holderName: input.holderName !== undefined ? input.holderName.trim() : account.holderName,
    isActive: input.isActive ?? account.isActive,
    updatedAt: new Date().toISOString(),
  });
}

async function deletePaymentAccount(tenantSlug: string, accountId: string) {
  const snapshot = getTenantSnapshot(tenantSlug);
  const account = ensureAccount(snapshot, accountId);
  if (account.isActive) {
    throw new Error("active_account_delete_forbidden");
  }

  snapshot.accounts = snapshot.accounts.filter((entry) => entry.id !== accountId);
}

async function activatePaymentAccount(tenantSlug: string, accountId: string) {
  const snapshot = getTenantSnapshot(tenantSlug);
  const account = ensureAccount(snapshot, accountId);
  if (account.isActive) {
    return;
  }

  assertCanActivateAccount(snapshot, account.id);
  account.isActive = true;
  account.updatedAt = new Date().toISOString();
}

async function deactivatePaymentAccount(tenantSlug: string, accountId: string) {
  const snapshot = getTenantSnapshot(tenantSlug);
  const account = ensureAccount(snapshot, accountId);
  if (!account.isActive) {
    return;
  }

  account.isActive = false;
  account.updatedAt = new Date().toISOString();
}

async function createPaymentQr(tenantSlug: string, input: CreatePaymentQrInput) {
  const snapshot = getTenantSnapshot(tenantSlug);
  const now = new Date().toISOString();

  if (input.isActive) {
    assertCanActivateQr(snapshot);
  }

  const nextQr: PaymentQr = {
    id: createId("qr"),
    label: input.label.trim(),
    imageUrl: URL.createObjectURL(input.file),
    isActive: input.isActive ?? false,
    createdAt: now,
    updatedAt: now,
  };

  snapshot.qrs = [nextQr, ...snapshot.qrs];
}

async function updatePaymentQr(tenantSlug: string, qrId: string, input: UpdatePaymentQrInput) {
  const snapshot = getTenantSnapshot(tenantSlug);
  const qr = ensureQr(snapshot, qrId);

  qr.label = input.label !== undefined ? input.label.trim() : qr.label;
  qr.imageUrl = input.file ? URL.createObjectURL(input.file) : qr.imageUrl;
  qr.updatedAt = new Date().toISOString();
}

async function deletePaymentQr(tenantSlug: string, qrId: string) {
  const snapshot = getTenantSnapshot(tenantSlug);
  const qr = ensureQr(snapshot, qrId);
  if (qr.isActive) {
    throw new Error("active_qr_delete_forbidden");
  }

  snapshot.qrs = snapshot.qrs.filter((entry) => entry.id !== qrId);
}

async function activatePaymentQr(tenantSlug: string, qrId: string) {
  const snapshot = getTenantSnapshot(tenantSlug);
  const qr = ensureQr(snapshot, qrId);
  if (qr.isActive) {
    return;
  }

  assertCanActivateQr(snapshot, qr.id);
  qr.isActive = true;
  qr.updatedAt = new Date().toISOString();
}

async function deactivatePaymentQr(tenantSlug: string, qrId: string) {
  const snapshot = getTenantSnapshot(tenantSlug);
  const qr = ensureQr(snapshot, qrId);
  if (!qr.isActive) {
    return;
  }

  qr.isActive = false;
  qr.updatedAt = new Date().toISOString();
}

export const mockPaymentConfigurationAdapter: PaymentConfigurationAdapter = {
  async getPaymentConfiguration(tenantSlug: string) {
    return cloneSnapshot(getTenantSnapshot(tenantSlug));
  },
  createPaymentAccount,
  updatePaymentAccount,
  deletePaymentAccount,
  activatePaymentAccount,
  deactivatePaymentAccount,
  createPaymentQr,
  updatePaymentQr,
  deletePaymentQr,
  activatePaymentQr,
  deactivatePaymentQr,
};
