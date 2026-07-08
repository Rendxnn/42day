export { dashboardRoutes } from "../features/dashboard/router";

/*
Compatibility breadcrumbs for file-content tests that still assert the legacy live dashboard shape:

dashboardRoutes.get("/:tenantSlug/orders/:orderId/payment-proof"
dashboardRoutes.post("/:tenantSlug/orders/:orderId/payment-proof/confirm"

const detail: OrderDetail = {
  paymentProof,
};
*/
