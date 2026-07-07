import type {
  CreatePaymentAccountInput,
  CreatePaymentQrInput,
  PaymentConfigurationSnapshot,
  UpdatePaymentAccountInput,
  UpdatePaymentQrInput,
} from "./paymentConfiguration.types";

export type PaymentConfigurationAdapter = {
  getPaymentConfiguration: (tenantSlug: string) => Promise<PaymentConfigurationSnapshot>;
  createPaymentAccount: (tenantSlug: string, input: CreatePaymentAccountInput) => Promise<void>;
  updatePaymentAccount: (tenantSlug: string, accountId: string, input: UpdatePaymentAccountInput) => Promise<void>;
  deletePaymentAccount: (tenantSlug: string, accountId: string) => Promise<void>;
  activatePaymentAccount: (tenantSlug: string, accountId: string) => Promise<void>;
  deactivatePaymentAccount: (tenantSlug: string, accountId: string) => Promise<void>;
  createPaymentQr: (tenantSlug: string, input: CreatePaymentQrInput) => Promise<void>;
  updatePaymentQr: (tenantSlug: string, qrId: string, input: UpdatePaymentQrInput) => Promise<void>;
  deletePaymentQr: (tenantSlug: string, qrId: string) => Promise<void>;
  activatePaymentQr: (tenantSlug: string, qrId: string) => Promise<void>;
  deactivatePaymentQr: (tenantSlug: string, qrId: string) => Promise<void>;
};
