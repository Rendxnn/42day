import type { TenantRole } from "../../api";
import type { PaymentConfigurationHealth } from "../../api";

export type { TenantRole };
export type { PaymentConfigurationHealth };

export type PaymentAccount = {
  id: string;
  bankName: string;
  accountNumber: string;
  holderName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PaymentQr = {
  id: string;
  label: string;
  imageUrl: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PaymentConfigurationSnapshot = {
  accounts: PaymentAccount[];
  qrs: PaymentQr[];
  constraints: {
    maxActiveAccounts: 5;
    maxActiveQrs: 1;
  };
};

export type CreatePaymentAccountInput = {
  bankName: string;
  accountNumber: string;
  holderName: string;
  isActive?: boolean;
};

export type UpdatePaymentAccountInput = Partial<CreatePaymentAccountInput>;

export type CreatePaymentQrInput = {
  label: string;
  file: File;
  isActive?: boolean;
};

export type UpdatePaymentQrInput = {
  label?: string;
  file?: File;
};

export type ConfigurationAccess = {
  canManage: boolean;
  role: TenantRole;
};
