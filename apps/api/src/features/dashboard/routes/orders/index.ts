import { Hono } from "hono";
import type { ApiBindings } from "../../../../lib/bindings";
import type { DashboardVariables } from "../../types";
import { registerOrdersAcceptRoute } from "./accept";
import { registerOrdersDetailRoute } from "./detail";
import { registerOrdersListRoute } from "./list";
import { registerOrdersKitchenProgressRoute } from "./kitchen-progress";
import { registerOrdersMenuTodayRoute } from "./menu-today";
import { registerOrdersOutOfStockRoute } from "./out-of-stock";
import { registerOrdersPaymentProofRoutes } from "./payment-proof";
import { registerOrdersRetryNotificationRoute } from "./retry-notification";
import { registerOrdersStatusRoute } from "./status";

export const ordersDashboardRoutes = new Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>();

registerOrdersMenuTodayRoute(ordersDashboardRoutes);
registerOrdersListRoute(ordersDashboardRoutes);
registerOrdersDetailRoute(ordersDashboardRoutes);
registerOrdersPaymentProofRoutes(ordersDashboardRoutes);
registerOrdersKitchenProgressRoute(ordersDashboardRoutes);
registerOrdersAcceptRoute(ordersDashboardRoutes);
registerOrdersOutOfStockRoute(ordersDashboardRoutes);
registerOrdersRetryNotificationRoute(ordersDashboardRoutes);
registerOrdersStatusRoute(ordersDashboardRoutes);
