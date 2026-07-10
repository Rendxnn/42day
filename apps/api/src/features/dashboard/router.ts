import { Hono } from "hono";
import type { ApiBindings } from "../../lib/bindings";
import { tenantAccessMiddleware } from "./auth";
import type { DashboardVariables } from "./types";
import { adminDashboardRoutes } from "./routes/admin";
import { alertsDashboardRoutes } from "./routes/alerts";
import { catalogDashboardRoutes } from "./routes/catalog";
import { diagnosticsDashboardRoutes } from "./routes/diagnostics";
import { lunchRemindersDashboardRoutes } from "./routes/lunch-reminders";
import { menuDashboardRoutes } from "./routes/menu";
import { notificationsDashboardRoutes } from "./routes/notifications";
import { ordersDashboardRoutes } from "./routes/orders";
import { publicCartaRoutes } from "./routes/public-carta";
import { settingsDashboardRoutes } from "./routes/settings";
import { uploadsDashboardRoutes } from "./routes/uploads";

export const dashboardRoutes = new Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>();

dashboardRoutes.route("/", adminDashboardRoutes);
dashboardRoutes.route("/", publicCartaRoutes);
dashboardRoutes.use("/:tenantSlug/*", tenantAccessMiddleware);
dashboardRoutes.route("/", ordersDashboardRoutes);
dashboardRoutes.route("/", notificationsDashboardRoutes);
dashboardRoutes.route("/", lunchRemindersDashboardRoutes);
dashboardRoutes.route("/", alertsDashboardRoutes);
dashboardRoutes.route("/", settingsDashboardRoutes);
dashboardRoutes.route("/", catalogDashboardRoutes);
dashboardRoutes.route("/", uploadsDashboardRoutes);
dashboardRoutes.route("/", diagnosticsDashboardRoutes);
dashboardRoutes.route("/", menuDashboardRoutes);
