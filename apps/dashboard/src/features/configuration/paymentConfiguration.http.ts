import {
  activatePaymentAccountRequest,
  activatePaymentQrRequest,
  createPaymentAccount,
  createPaymentQrRequest,
  deactivatePaymentAccountRequest,
  deactivatePaymentQrRequest,
  deletePaymentAccountRequest,
  deletePaymentQrRequest,
  getPaymentConfiguration,
  updatePaymentAccountRequest,
  updatePaymentQrRequest,
} from "../../api";
import type { PaymentConfigurationAdapter } from "./paymentConfiguration.adapter";

export const httpPaymentConfigurationAdapter: PaymentConfigurationAdapter = {
  getPaymentConfiguration,
  async createPaymentAccount(tenantSlug, input) {
    await createPaymentAccount(tenantSlug, input);
  },
  async updatePaymentAccount(tenantSlug, accountId, input) {
    await updatePaymentAccountRequest(tenantSlug, accountId, input);
  },
  async deletePaymentAccount(tenantSlug, accountId) {
    await deletePaymentAccountRequest(tenantSlug, accountId);
  },
  async activatePaymentAccount(tenantSlug, accountId) {
    await activatePaymentAccountRequest(tenantSlug, accountId);
  },
  async deactivatePaymentAccount(tenantSlug, accountId) {
    await deactivatePaymentAccountRequest(tenantSlug, accountId);
  },
  async createPaymentQr(tenantSlug, input) {
    await createPaymentQrRequest(tenantSlug, input);
  },
  async updatePaymentQr(tenantSlug, qrId, input) {
    await updatePaymentQrRequest(tenantSlug, qrId, input);
  },
  async deletePaymentQr(tenantSlug, qrId) {
    await deletePaymentQrRequest(tenantSlug, qrId);
  },
  async activatePaymentQr(tenantSlug, qrId) {
    await activatePaymentQrRequest(tenantSlug, qrId);
  },
  async deactivatePaymentQr(tenantSlug, qrId) {
    await deactivatePaymentQrRequest(tenantSlug, qrId);
  },
};
