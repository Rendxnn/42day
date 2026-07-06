import { Hono } from "hono";
import type { Context } from "hono";
import type {
  AcceptOrderRequest,
  AutomationSettings,
  HumanInterventionAlert,
  HumanInterventionStatus,
  Menu,
  MenuItem,
  OrderCustomerNotificationType,
  OrderDetail,
  OrderLineItem,
  OrderLineItemOptionsSnapshot,
  OrdersBucket,
  OrdersDashboardPayload,
  OrderStatus,
  OrderSummary,
  Product,
  PublicCartaPayload,
  RejectOutOfStockOrderRequest,
  RetryOrderCustomerNotificationRequest,
  TodayMenuPayload,
} from "@42day/types";
import type { ApiBindings } from "../lib/bindings.ts";
import { createSupabaseRestClient, SupabaseRestError } from "../lib/supabase-rest.ts";
import { updateConversationState } from "../modules/conversation-service/conversation-service.ts";
import { processMenuFile } from "../modules/menu-upload/menuFileProcessor.ts";
import { logOutboundTextMessage } from "../modules/message-log/message-log.ts";
import { sendWhatsAppTextMessage } from "../modules/whatsapp-webhook/whatsapp-client.ts";
import {
  confirmLatestPaymentProofForOrder,
  downloadLatestPaymentProofForOrder,
  getLatestPaymentProofForOrder,
} from "../features/payment-proofs/service.ts";

type TenantRow = {
  id: string;
  name?: string;
  slug: string;
  schema_name: string;
  status?: TenantStatus;
  timezone?: string;
  currency?: string;
  automation_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
};

type TenantUserRow = {
  tenant_id: string;
  user_id: string;
  role: "encargado" | "trabajador";
  status: "active" | "inactive";
  created_at?: string;
};

type TenantStatus = "active" | "inactive" | "suspended";

type AdminAuthUser = {
  id: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string | null;
  user_metadata?: {
    name?: string;
    username?: string;
    source?: string;
  };
  app_metadata?: Record<string, unknown>;
};

type LocationRow = {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  delivery_fee_fixed: number;
  transfer_payment_instructions?: string | null;
  pickup_enabled?: boolean;
  delivery_enabled?: boolean;
  automation_enabled?: boolean;
  is_active: boolean;
};

type ProductRow = {
  id: string;
  name: string;
  description?: string;
  base_price: number;
  category?: string;
  emoji?: string | null;
  product_type?: "simple" | "composite" | null;
  image_url?: string;
  is_active: boolean;
};

type ProductOptionRow = {
  id: string;
  product_id: string;
  name: string;
  description?: string | null;
  type: "single" | "multiple" | "text";
  is_required: boolean;
  min_select: number;
  max_select: number;
  sort_order?: number | null;
  display_mode?: "list" | "buttons" | "swatches" | "text" | null;
};

type ProductOptionValueRow = {
  id: string;
  option_id: string;
  name: string;
  description?: string | null;
  price_delta: number;
  is_active: boolean;
  sort_order?: number | null;
};

type MenuRow = {
  id: string;
  location_id: string;
  date: string;
  name: string;
  status: Menu["status"];
  published_at?: string;
};

type MenuItemRow = {
  id: string;
  menu_id: string;
  product_id?: string;
  combo_id?: string;
  display_name?: string;
  price_override?: number;
  available_quantity?: number;
  is_available: boolean;
  sort_order: number;
};

type CustomerRow = {
  id: string;
  phone: string;
  name?: string;
};

type OrderRow = {
  id: string;
  draft_order_id?: string | null;
  customer_id: string;
  location_id?: string | null;
  status: OrderStatus;
  fulfillment_type: "delivery" | "pickup";
  service_timing?: "asap" | "scheduled" | null;
  scheduled_for?: string | null;
  delivery_address?: string | null;
  delivery_address_id?: string | null;
  payment_method: "cash" | "transfer";
  payment_proof_file_id?: string | null;
  subtotal: number;
  delivery_fee: number;
  discount_total: number;
  total: number;
  restaurant_reviewed_at?: string | null;
  restaurant_reviewed_by?: string | null;
  restaurant_confirmed_at?: string | null;
  restaurant_confirmed_by?: string | null;
  restaurant_review_note?: string | null;
  restaurant_review_metadata?: Record<string, unknown> | null;
  customer_notified_at?: string | null;
  customer_notification_status?: "pending" | "sent" | "failed" | null;
  customer_notification_error?: string | null;
  payment_confirmed_at?: string | null;
  created_at: string;
  updated_at: string;
};

type DraftOrderRow = {
  id: string;
  conversation_id?: string | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  menu_item_id?: string | null;
  product_id?: string | null;
  combo_id?: string | null;
  category_snapshot?: string | null;
  name_snapshot: string;
  quantity: number;
  unit_price: number;
  options_snapshot?: OrderLineItemOptionsSnapshot | null;
  notes?: string | null;
  line_total: number;
};

type AlertRow = {
  id: string;
  conversation_id?: string | null;
  draft_order_id?: string | null;
  order_id?: string | null;
  type: string;
  status: HumanInterventionStatus;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  resolved_at?: string | null;
};

type OrderNotificationContext = {
  order: OrderRow;
  customer: CustomerRow;
  draftOrder?: DraftOrderRow;
  location?: LocationRow;
};

type LunchReminderRecipient = {
  customer: CustomerRow;
  order: Pick<OrderRow, "id" | "draft_order_id" | "created_at">;
  conversationId?: string;
};

type LunchReminderMenuItem = {
  name: string;
  price?: number;
  category?: string;
};

type DashboardVariables = {
  authUser: AuthUser;
  authorizedTenants: TenantRow[];
  tenant: TenantRow;
};

type AuthUser = {
  id: string;
  email?: string;
  app_metadata?: {
    role?: string;
    system_admin?: boolean;
  };
};

type GeminiMenuProduct = {
  name: string;
  description?: string;
  basePrice: number;
  category?: string;
  confidence?: number;
};

export const dashboardRoutes = new Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>();

dashboardRoutes.get("/tenants", async (c) => {
  const authUser = await requireAuthUser(c);
  if (authUser instanceof Response) return authUser;
  const tenants = await getAuthorizedTenants(c.env, authUser.id);

  return c.json(
    tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      schemaName: tenant.schema_name,
    })),
  );
});

dashboardRoutes.get("/me", async (c) => {
  const authUser = await requireAuthUser(c);
  if (authUser instanceof Response) return authUser;
  const tenants = await getAuthorizedTenants(c.env, authUser.id);

  return c.json({
    user: authUser,
    tenants: tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      schemaName: tenant.schema_name,
    })),
  });
});

dashboardRoutes.get("/admin/overview", async (c) => {
  const authUser = await requireAuthUser(c);
  if (authUser instanceof Response) return authUser;

  if (!isSystemAdmin(authUser)) {
    return c.json({ error: "admin_forbidden" }, 403);
  }

  const tenants = await createSupabaseRestClient(c.env).select<TenantRow>({
    schema: "control",
    table: "tenants",
    query: {
      select: "id,name,slug,schema_name,timezone",
      status: "eq.active",
    },
  });

  return c.json({
    activeRestaurantCount: tenants.filter((tenant) => tenant.slug !== "thaledon").length,
  });
});

dashboardRoutes.get("/admin/restaurants", async (c) => {
  const authUser = await requireAuthUser(c);
  if (authUser instanceof Response) return authUser;

  if (!isSystemAdmin(authUser)) {
    return c.json({ error: "admin_forbidden" }, 403);
  }

  const restaurants = await listAdminRestaurants(c.env);
  return c.json({ restaurants });
});

dashboardRoutes.post("/admin/restaurants", async (c) => {
  const authUser = await requireAuthUser(c);
  if (authUser instanceof Response) return authUser;

  if (!isSystemAdmin(authUser)) {
    return c.json({ error: "admin_forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => ({})) as {
    name?: string;
    slug?: string;
    timezone?: string;
    currency?: string;
    status?: TenantStatus;
    automationEnabled?: boolean;
    locationName?: string;
    locationAddress?: string;
    locationPhone?: string;
    deliveryFeeFixed?: number;
    ownerEmail?: string;
    ownerName?: string;
    ownerPassword?: string;
  };
  const name = String(body.name ?? "").trim();
  const slug = normalizeTenantSlug(body.slug || name);
  const ownerEmail = String(body.ownerEmail ?? "").trim().toLowerCase();

  if (!name || !slug) {
    return c.json({ error: "restaurant_name_required" }, 400);
  }

  if (!ownerEmail || !ownerEmail.includes("@")) {
    return c.json({ error: "restaurant_owner_email_required" }, 400);
  }

  const schemaName = `tenant_${slug.replace(/-/g, "_")}`;
  const supabase = createSupabaseRestClient(c.env);
  const [existing] = await supabase.select<TenantRow>({
    schema: "control",
    table: "tenants",
    query: {
      select: "id,slug,schema_name",
      slug: `eq.${slug}`,
      limit: 1,
    },
  });

  if (existing) {
    return c.json({ error: "restaurant_slug_already_exists" }, 409);
  }

  const provisioned = await supabase.rpc<TenantRow[]>({
    schema: "control",
    functionName: "provision_restaurant_tenant",
    args: {
      p_name: name,
      p_slug: slug,
      p_schema_name: schemaName,
      p_timezone: body.timezone || "America/Bogota",
      p_currency: body.currency || "COP",
      p_status: body.status || "active",
      p_automation_enabled: body.automationEnabled ?? true,
      p_location_name: body.locationName || "Sede principal",
      p_location_address: body.locationAddress || null,
      p_location_phone: body.locationPhone || null,
      p_delivery_fee_fixed: Number(body.deliveryFeeFixed ?? 0),
    },
  });
  const tenant = provisioned[0];

  if (!tenant) {
    return c.json({ error: "restaurant_provision_failed" }, 500);
  }

  await refreshPostgrestTenantSchemas(c.env);

  const ownerPassword = body.ownerPassword || buildDefaultRestaurantPassword(slug);
  const ownerMember = await createOrLinkRestaurantMember(c.env, tenant, {
    email: ownerEmail,
    name: body.ownerName || name,
    password: ownerPassword,
    role: "encargado",
    resetPasswordIfUserExists: Boolean(body.ownerPassword),
  });

  const verification = await verifyProvisionedRestaurant(c.env, tenant, ownerMember.member.userId);
  if (!verification.ok) {
    return c.json({
      error: "restaurant_provision_verification_failed",
      details: verification.failures,
    }, 500);
  }

  const restaurants = await listAdminRestaurants(c.env);
  const restaurant = restaurants.find((entry) => entry.id === tenant.id) ?? mapAdminRestaurant(tenant);

  return c.json({
    restaurant,
    owner: ownerMember?.member,
    temporaryPassword: ownerMember ? ownerPassword : undefined,
  }, 201);
});

dashboardRoutes.patch("/admin/restaurants/:tenantId", async (c) => {
  const authUser = await requireAuthUser(c);
  if (authUser instanceof Response) return authUser;

  if (!isSystemAdmin(authUser)) {
    return c.json({ error: "admin_forbidden" }, 403);
  }

  const tenant = await getTenantById(c.env, c.req.param("tenantId"));
  if (!tenant) {
    return c.json({ error: "restaurant_not_found" }, 404);
  }

  const body = await c.req.json().catch(() => ({})) as {
    name?: string;
    status?: TenantStatus;
    timezone?: string;
    currency?: string;
    automationEnabled?: boolean;
    locationName?: string;
    locationAddress?: string;
    locationPhone?: string;
    deliveryFeeFixed?: number;
    pickupEnabled?: boolean;
    deliveryEnabled?: boolean;
    locationAutomationEnabled?: boolean;
    transferPaymentInstructions?: string;
  };
  const tenantPatch: Record<string, unknown> = {};

  if (body.name !== undefined) tenantPatch.name = String(body.name).trim();
  if (body.status !== undefined) tenantPatch.status = body.status;
  if (body.timezone !== undefined) tenantPatch.timezone = String(body.timezone).trim() || "America/Bogota";
  if (body.currency !== undefined) tenantPatch.currency = String(body.currency).trim() || "COP";
  if (body.automationEnabled !== undefined) tenantPatch.automation_enabled = body.automationEnabled;
  if (Object.keys(tenantPatch).length > 0) tenantPatch.updated_at = new Date().toISOString();

  if (tenantPatch.status && !["active", "inactive", "suspended"].includes(String(tenantPatch.status))) {
    return c.json({ error: "invalid_restaurant_status" }, 400);
  }

  const supabase = createSupabaseRestClient(c.env);
  if (Object.keys(tenantPatch).length > 0) {
    await supabase.update({
      schema: "control",
      table: "tenants",
      query: { id: `eq.${tenant.id}` },
      values: tenantPatch,
    });
  }

  await updatePrimaryLocation(c.env, tenant.schema_name, {
    name: body.locationName,
    address: body.locationAddress,
    phone: body.locationPhone,
    deliveryFeeFixed: body.deliveryFeeFixed,
    pickupEnabled: body.pickupEnabled,
    deliveryEnabled: body.deliveryEnabled,
    automationEnabled: body.locationAutomationEnabled,
    transferPaymentInstructions: body.transferPaymentInstructions,
  });

  const restaurants = await listAdminRestaurants(c.env);
  return c.json({ restaurant: restaurants.find((entry) => entry.id === tenant.id) });
});

dashboardRoutes.delete("/admin/restaurants/:tenantId", async (c) => {
  const authUser = await requireAuthUser(c);
  if (authUser instanceof Response) return authUser;

  if (!isSystemAdmin(authUser)) {
    return c.json({ error: "admin_forbidden" }, 403);
  }

  const tenant = await getTenantById(c.env, c.req.param("tenantId"));
  if (!tenant) {
    return c.json({ error: "restaurant_not_found" }, 404);
  }

  const supabase = createSupabaseRestClient(c.env);
  await Promise.all([
    supabase.update({
      schema: "control",
      table: "tenants",
      query: { id: `eq.${tenant.id}` },
      values: { status: "inactive", automation_enabled: false, updated_at: new Date().toISOString() },
    }),
    supabase.update({
      schema: "control",
      table: "tenant_users",
      query: { tenant_id: `eq.${tenant.id}` },
      values: { status: "inactive" },
    }),
    supabase.update({
      schema: "control",
      table: "tenant_channels",
      query: { tenant_id: `eq.${tenant.id}` },
      values: { status: "inactive" },
    }).catch((error) => {
      if (isMissingTableError(error)) return [];
      throw error;
    }),
  ]);

  return c.json({ ok: true });
});

dashboardRoutes.post("/admin/restaurants/:tenantId/members", async (c) => {
  const authUser = await requireAuthUser(c);
  if (authUser instanceof Response) return authUser;

  if (!isSystemAdmin(authUser)) {
    return c.json({ error: "admin_forbidden" }, 403);
  }

  const tenant = await getTenantById(c.env, c.req.param("tenantId"));
  if (!tenant) {
    return c.json({ error: "restaurant_not_found" }, 404);
  }

  const body = await c.req.json().catch(() => ({})) as {
    email?: string;
    name?: string;
    role?: TenantUserRow["role"];
    password?: string;
  };
  const email = String(body.email ?? "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return c.json({ error: "member_email_required" }, 400);
  }

  const role = body.role === "trabajador" ? "trabajador" : "encargado";
  const temporaryPassword = body.password || buildDefaultRestaurantPassword(tenant.slug);
  const result = await createOrLinkRestaurantMember(c.env, tenant, {
    email,
    name: body.name || email.split("@")[0] || "Usuario",
    password: temporaryPassword,
    role,
    resetPasswordIfUserExists: Boolean(body.password),
  });

  return c.json({
    member: result.member,
    temporaryPassword,
  }, 201);
});

dashboardRoutes.patch("/admin/restaurants/:tenantId/members/:userId", async (c) => {
  const authUser = await requireAuthUser(c);
  if (authUser instanceof Response) return authUser;

  if (!isSystemAdmin(authUser)) {
    return c.json({ error: "admin_forbidden" }, 403);
  }

  const tenant = await getTenantById(c.env, c.req.param("tenantId"));
  if (!tenant) {
    return c.json({ error: "restaurant_not_found" }, 404);
  }

  const body = await c.req.json().catch(() => ({})) as {
    role?: TenantUserRow["role"];
    status?: TenantUserRow["status"];
    name?: string;
  };
  const patch: Record<string, unknown> = {};
  if (body.role !== undefined) patch.role = body.role;
  if (body.status !== undefined) patch.status = body.status;

  if (patch.role && !["encargado", "trabajador"].includes(String(patch.role))) {
    return c.json({ error: "invalid_member_role" }, 400);
  }

  if (patch.status && !["active", "inactive"].includes(String(patch.status))) {
    return c.json({ error: "invalid_member_status" }, 400);
  }

  if (Object.keys(patch).length > 0) {
    await createSupabaseRestClient(c.env).update({
      schema: "control",
      table: "tenant_users",
      query: {
        tenant_id: `eq.${tenant.id}`,
        user_id: `eq.${c.req.param("userId")}`,
      },
      values: patch,
    });
  }

  if (body.name !== undefined) {
    await updateAuthAdminUser(c.env, c.req.param("userId"), {
      user_metadata: {
        name: String(body.name).trim(),
        source: "admin_console",
      },
    });
  }

  const restaurants = await listAdminRestaurants(c.env);
  const restaurant = restaurants.find((entry) => entry.id === tenant.id);
  return c.json({ restaurant });
});

dashboardRoutes.delete("/admin/restaurants/:tenantId/members/:userId", async (c) => {
  const authUser = await requireAuthUser(c);
  if (authUser instanceof Response) return authUser;

  if (!isSystemAdmin(authUser)) {
    return c.json({ error: "admin_forbidden" }, 403);
  }

  const tenant = await getTenantById(c.env, c.req.param("tenantId"));
  if (!tenant) {
    return c.json({ error: "restaurant_not_found" }, 404);
  }

  await createSupabaseRestClient(c.env).update({
    schema: "control",
    table: "tenant_users",
    query: {
      tenant_id: `eq.${tenant.id}`,
      user_id: `eq.${c.req.param("userId")}`,
    },
    values: { status: "inactive" },
  });

  return c.json({ ok: true });
});

dashboardRoutes.post("/admin/restaurants/:tenantId/members/:userId/reset-password", async (c) => {
  const authUser = await requireAuthUser(c);
  if (authUser instanceof Response) return authUser;

  if (!isSystemAdmin(authUser)) {
    return c.json({ error: "admin_forbidden" }, 403);
  }

  const tenant = await getTenantById(c.env, c.req.param("tenantId"));
  if (!tenant) {
    return c.json({ error: "restaurant_not_found" }, 404);
  }

  const body = await c.req.json().catch(() => ({})) as { password?: string };
  const temporaryPassword = body.password || buildDefaultRestaurantPassword(tenant.slug);

  await updateAuthAdminUser(c.env, c.req.param("userId"), {
    password: temporaryPassword,
  });

  return c.json({ temporaryPassword });
});

dashboardRoutes.get("/public/:tenantSlug/carta", async (c) => {
  const supabase = createSupabaseRestClient(c.env);
  const [tenant] = await supabase.select<TenantRow>({
    schema: "control",
    table: "tenants",
    query: {
      select: "id,name,slug,schema_name,timezone",
      slug: `eq.${c.req.param("tenantSlug")}`,
      status: "eq.active",
      limit: 1,
    },
  });

  if (!tenant) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  const date = resolveBusinessDate(c.req.query("date"), tenant.timezone);
  const [location] = await supabase.select<LocationRow>({
    schema: tenant.schema_name,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  const [menu] = location
    ? await supabase.select<MenuRow>({
        schema: tenant.schema_name,
        table: "menus",
        query: {
          select: "id,location_id,date,name,status,published_at",
          location_id: `eq.${location.id}`,
          date: `eq.${date}`,
          status: "eq.published",
          limit: 1,
        },
      })
    : [];

  const itemRows = menu
    ? await supabase.select<MenuItemRow>({
        schema: tenant.schema_name,
        table: "menu_items",
        query: {
          select: "id,menu_id,product_id,combo_id,display_name,price_override,available_quantity,is_available,sort_order",
          menu_id: `eq.${menu.id}`,
          is_available: "eq.true",
          order: "sort_order.asc",
        },
      })
    : [];

  const productIds = itemRows
    .map((item) => item.product_id)
    .filter((productId): productId is string => Boolean(productId));
  const products = productIds.length > 0
    ? await selectProducts(supabase, tenant.schema_name, {
        id: `in.(${productIds.join(",")})`,
        is_active: "eq.true",
      })
    : [];
  const productOptions = await selectProductOptions(supabase, tenant.schema_name, products.map((product) => product.id));
  const productById = new Map(products.map((product) => [product.id, mapProduct(product, productOptions.get(product.id))]));

  const payload: PublicCartaPayload = {
    tenant: {
      name: tenant.name ?? tenant.slug,
      slug: tenant.slug,
    },
    requestedDate: date,
    generatedAt: new Date().toISOString(),
    location: location ? mapLocation(location) : undefined,
    menu: menu ? mapMenu(menu) : undefined,
    items: itemRows
      .map((item) => mapMenuItem(item, productById.get(item.product_id ?? "")))
      .filter((item) => item.product?.isActive !== false),
  };

  return c.json(payload);
});

dashboardRoutes.use("/:tenantSlug/*", async (c, next) => {
  const authUser = await requireAuthUser(c);
  if (authUser instanceof Response) return authUser;
  const supabase = createSupabaseRestClient(c.env);
  const tenants = await getAuthorizedTenants(c.env, authUser.id);
  const tenant = tenants.find((entry) => entry.slug === c.req.param("tenantSlug"));

  if (!tenant) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  c.set("authUser", authUser);
  c.set("authorizedTenants", tenants);
  c.set("tenant", tenant);
  await next();
});

dashboardRoutes.get("/:tenantSlug/menu/today", async (c) => {
  const tenant = c.get("tenant");
  const supabase = createSupabaseRestClient(c.env);
  const date = resolveBusinessDate(c.req.query("date"), tenant.timezone);
  const [location] = await supabase.select<LocationRow>({
    schema: tenant.schema_name,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  const [menu] = location
    ? await supabase.select<MenuRow>({
        schema: tenant.schema_name,
        table: "menus",
        query: {
          select: "id,location_id,date,name,status,published_at",
          location_id: `eq.${location.id}`,
          date: `eq.${date}`,
          limit: 1,
        },
      })
    : [];

  const products = await selectProducts(supabase, tenant.schema_name);
  const productOptions = await selectProductOptions(supabase, tenant.schema_name, products.map((product) => product.id));

  const itemRows = menu
    ? await supabase.select<MenuItemRow>({
        schema: tenant.schema_name,
        table: "menu_items",
        query: {
          select: "id,menu_id,product_id,combo_id,display_name,price_override,available_quantity,is_available,sort_order",
          menu_id: `eq.${menu.id}`,
          order: "sort_order.asc",
        },
      })
    : [];

  const productById = new Map(products.map((product) => [product.id, mapProduct(product, productOptions.get(product.id))]));
  const payload: TodayMenuPayload = {
    tenantSlug: tenant.slug,
    tenantSchema: tenant.schema_name,
    location: location ? mapLocation(location) : undefined,
    menu: menu ? mapMenu(menu) : undefined,
    items: itemRows.map((item) => mapMenuItem(item, productById.get(item.product_id ?? ""))),
    products: products.map((product) => mapProduct(product, productOptions.get(product.id))),
  };

  return c.json(payload);
});

dashboardRoutes.get("/:tenantSlug/lunch-reminders/preview", async (c) => {
  const tenant = c.get("tenant");
  const [recipients, menuItems] = await Promise.all([
    resolveLunchReminderRecipients(c.env, tenant.schema_name),
    resolveLunchReminderMenuItems(c.env, tenant.schema_name, tenant.timezone),
  ]);

  const messagePreview = menuItems.length > 0 && recipients[0]
    ? buildLunchReminderMessage({
        restaurantName: tenant.name ?? tenant.slug,
        customerName: recipients[0].customer.name,
        menuItems,
      })
    : "";

  return c.json({
    lookbackDays: 3,
    recipientCount: recipients.length,
    menuItemCount: menuItems.length,
    canSend: recipients.length > 0 && menuItems.length > 0,
    messagePreview,
    recipients: recipients.slice(0, 8).map((recipient) => ({
      customerId: recipient.customer.id,
      name: recipient.customer.name,
      phone: recipient.customer.phone,
      lastOrderAt: recipient.order.created_at,
    })),
  });
});

dashboardRoutes.post("/:tenantSlug/lunch-reminders/send", async (c) => {
  const tenant = c.get("tenant");
  const authUser = c.get("authUser");
  const role = await getTenantUserRole(c.env, authUser.id, tenant.id);

  if (!role) {
    return c.json({ error: "forbidden" }, 403);
  }

  const [recipients, menuItems] = await Promise.all([
    resolveLunchReminderRecipients(c.env, tenant.schema_name),
    resolveLunchReminderMenuItems(c.env, tenant.schema_name, tenant.timezone),
  ]);

  if (menuItems.length === 0) {
    return c.json({ error: "lunch_reminder_menu_not_available" }, 409);
  }

  if (recipients.length === 0) {
    return c.json({ error: "lunch_reminder_recipients_not_found" }, 409);
  }

  const batchId = crypto.randomUUID();
  const results: Array<{
    customerId: string;
    name?: string;
    phone: string;
    lastOrderAt: string;
    status: "sent" | "failed";
    providerMessageId?: string;
  }> = [];

  for (const recipient of recipients) {
    const text = buildLunchReminderMessage({
      restaurantName: tenant.name ?? tenant.slug,
      customerName: recipient.customer.name,
      menuItems,
    });
    const result = await sendWhatsAppTextMessage(c.env, {
      to: recipient.customer.phone,
      text,
    });
    const sent = Boolean(result.providerMessageId);

    results.push({
      customerId: recipient.customer.id,
      name: recipient.customer.name,
      phone: recipient.customer.phone,
      lastOrderAt: recipient.order.created_at,
      status: sent ? "sent" : "failed",
      providerMessageId: result.providerMessageId,
    });

    if (recipient.conversationId) {
      await logOutboundTextMessage({
        env: c.env,
        schemaName: tenant.schema_name,
        conversationId: recipient.conversationId,
        text,
        result,
        metadata: {
          marketing: {
            type: "lunch_reminder",
            batchId,
            source: "dashboard_api",
            triggeredBy: authUser.id,
          },
        },
      }).catch(() => undefined);
    }

    await createSupabaseRestClient(c.env).insert({
      schema: tenant.schema_name,
      table: "app_events",
      rows: {
        conversation_id: recipient.conversationId ?? null,
        draft_order_id: recipient.order.draft_order_id ?? null,
        order_id: recipient.order.id,
        event_name: sent ? "marketing.lunch_reminder_sent" : "marketing.lunch_reminder_failed",
        severity: sent ? "info" : "warn",
        source: "dashboard_api",
        metadata: {
          batchId,
          customerId: recipient.customer.id,
          phone: recipient.customer.phone,
          providerMessageId: result.providerMessageId ?? null,
          triggeredBy: authUser.id,
        },
      },
    }).catch(() => undefined);
  }

  return c.json({
    batchId,
    lookbackDays: 3,
    recipientCount: recipients.length,
    sentCount: results.filter((result) => result.status === "sent").length,
    failedCount: results.filter((result) => result.status === "failed").length,
    menuItemCount: menuItems.length,
    results,
  });
});

dashboardRoutes.get("/:tenantSlug/orders", async (c) => {
  const tenant = c.get("tenant");
  const supabase = createSupabaseRestClient(c.env);
  const bucket = parseOrdersBucket(c.req.query("bucket"));
  const status = parseOrderStatusFilter(c.req.query("status"));
  const limit = parsePositiveInt(c.req.query("limit"), 200);
  let orders: OrderRow[] = [];
  let customers: CustomerRow[] = [];
  let alerts: AlertRow[] = [];

  try {
    [orders, customers, alerts] = await Promise.all([
      supabase.select<OrderRow>({
        schema: tenant.schema_name,
        table: "orders",
        query: {
          select:
            "id,draft_order_id,customer_id,location_id,status,fulfillment_type,service_timing,scheduled_for,delivery_address,delivery_address_id,payment_method,payment_proof_file_id,subtotal,delivery_fee,discount_total,total,restaurant_reviewed_at,restaurant_reviewed_by,restaurant_confirmed_at,restaurant_confirmed_by,restaurant_review_note,restaurant_review_metadata,customer_notified_at,customer_notification_status,customer_notification_error,payment_confirmed_at,created_at,updated_at",
          ...(status ? { status: `eq.${status}` } : {}),
          order: "created_at.desc",
          limit,
        },
      }),
      supabase.select<CustomerRow>({
        schema: tenant.schema_name,
        table: "customers",
        query: {
          select: "id,phone,name",
          limit: 500,
        },
      }),
      selectAlerts(supabase, tenant.schema_name, {
        limit: 200,
      }),
    ]);
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const summaries = orders.map((order) => mapOrderSummary(order, customerById.get(order.customer_id)));
  const filteredOrders = summaries.filter((order) => matchesOrdersBucket(order, bucket));
  const openAlerts = alerts.filter((alert) => alert.status === "open");
  const payload: OrdersDashboardPayload = {
    bucket,
    counts: {
      pendingConfirmation: summaries.filter((order) => matchesOrdersBucket(order, "pending_confirmation")).length,
      active: summaries.filter((order) => matchesOrdersBucket(order, "active")).length,
      history: summaries.filter((order) => matchesOrdersBucket(order, "history")).length,
      transferPendingReview: summaries.filter((order) => order.status === "payment_pending_review").length,
      openAlerts: openAlerts.length,
    },
    orders: filteredOrders,
  };

  return c.json(payload);
});

dashboardRoutes.get("/:tenantSlug/orders/:orderId", async (c) => {
  const tenant = c.get("tenant");
  const supabase = createSupabaseRestClient(c.env);
  let order: OrderRow | undefined;

  try {
    [order] = await supabase.select<OrderRow>({
      schema: tenant.schema_name,
      table: "orders",
      query: {
        select:
          "id,draft_order_id,customer_id,location_id,status,fulfillment_type,service_timing,scheduled_for,delivery_address,delivery_address_id,payment_method,payment_proof_file_id,subtotal,delivery_fee,discount_total,total,restaurant_reviewed_at,restaurant_reviewed_by,restaurant_confirmed_at,restaurant_confirmed_by,restaurant_review_note,restaurant_review_metadata,customer_notified_at,customer_notification_status,customer_notification_error,payment_confirmed_at,created_at,updated_at",
        id: `eq.${c.req.param("orderId")}`,
        limit: 1,
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return c.json({ error: "order_module_unavailable" }, 404);
    }

    throw error;
  }

  if (!order) {
    return c.json({ error: "order_not_found" }, 404);
  }

  let paymentProof = undefined;
  if (order.payment_proof_file_id) {
    try {
      paymentProof = await getLatestPaymentProofForOrder({
        env: c.env,
        schemaName: tenant.schema_name,
        orderId: order.id,
        paymentProofId: order.payment_proof_file_id,
      });
    } catch (error) {
      console.error("dashboard.payment_proof_metadata_failed", {
        orderId: order.id,
        tenantSlug: tenant.slug,
        paymentProofId: order.payment_proof_file_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const [customer, items] = await Promise.all([
    supabase.select<CustomerRow>({
      schema: tenant.schema_name,
      table: "customers",
      query: {
        select: "id,phone,name",
        id: `eq.${order.customer_id}`,
        limit: 1,
      },
    }),
    supabase.select<OrderItemRow>({
      schema: tenant.schema_name,
      table: "order_items",
      query: {
        select: "id,order_id,menu_item_id,product_id,combo_id,category_snapshot,name_snapshot,quantity,unit_price,options_snapshot,notes,line_total",
        order_id: `eq.${order.id}`,
      },
    }),
  ]);

  const detail: OrderDetail = {
    ...mapOrderSummary(order, customer[0]),
    locationId: order.location_id ?? undefined,
    deliveryAddress: order.delivery_address ?? undefined,
    deliveryAddressId: order.delivery_address_id ?? undefined,
    items: items.map(mapOrderLineItem),
    paymentProof,
  };

  return c.json(detail);
});

dashboardRoutes.get("/:tenantSlug/orders/:orderId/payment-proof", async (c) => {
  const tenant = c.get("tenant");
  const authUser = c.get("authUser");
  const role = await getTenantUserRole(c.env, authUser.id, tenant.id);

  if (!role) {
    return c.json({ error: "forbidden" }, 403);
  }

  const [order] = await createSupabaseRestClient(c.env).select<OrderRow>({
    schema: tenant.schema_name,
    table: "orders",
    query: {
      select:
        "id,draft_order_id,customer_id,location_id,status,fulfillment_type,service_timing,scheduled_for,delivery_address,delivery_address_id,payment_method,payment_proof_file_id,subtotal,delivery_fee,discount_total,total,restaurant_reviewed_at,restaurant_reviewed_by,restaurant_confirmed_at,restaurant_confirmed_by,restaurant_review_note,restaurant_review_metadata,customer_notified_at,customer_notification_status,customer_notification_error,payment_confirmed_at,created_at,updated_at",
      id: `eq.${c.req.param("orderId")}`,
      limit: 1,
    },
  });

  if (!order) {
    return c.json({ error: "order_not_found" }, 404);
  }

  let paymentProof;
  try {
    paymentProof = await downloadLatestPaymentProofForOrder({
      env: c.env,
      schemaName: tenant.schema_name,
      orderId: order.id,
      paymentProofId: order.payment_proof_file_id ?? undefined,
    });
  } catch (error) {
    return mapPaymentProofDownloadError(c, tenant.slug, order.id, error);
  }

  if (!paymentProof) {
    return c.json({ error: "payment_proof_not_found" }, 404);
  }

  return new Response(paymentProof.data, {
    headers: {
      "Content-Type": paymentProof.contentType,
      "Content-Disposition": `inline; filename="${paymentProof.filename}"`,
      "Cache-Control": "no-store",
    },
  });
});

dashboardRoutes.post("/:tenantSlug/orders/:orderId/payment-proof/confirm", async (c) => {
  const tenant = c.get("tenant");
  const authUser = c.get("authUser");
  const role = await getTenantUserRole(c.env, authUser.id, tenant.id);

  if (!role) {
    return c.json({ error: "forbidden" }, 403);
  }

  try {
    await confirmLatestPaymentProofForOrder({
      env: c.env,
      schemaName: tenant.schema_name,
      orderId: c.req.param("orderId"),
      reviewedBy: authUser.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message === "payment_proof.order_not_found") {
      return c.json({ error: "order_not_found" }, 404);
    }

    if (message === "payment_proof.not_found") {
      return c.json({ error: "payment_proof_not_found" }, 404);
    }

    if (message === "payment_proof.order_not_pending_review") {
      return c.json({ error: "order_not_pending_payment_review" }, 409);
    }

    throw error;
  }

  const [updatedOrder, customers] = await Promise.all([
    createSupabaseRestClient(c.env).select<OrderRow>({
      schema: tenant.schema_name,
      table: "orders",
      query: {
        select:
          "id,draft_order_id,customer_id,location_id,status,fulfillment_type,service_timing,scheduled_for,delivery_address,delivery_address_id,payment_method,payment_proof_file_id,subtotal,delivery_fee,discount_total,total,restaurant_reviewed_at,restaurant_reviewed_by,restaurant_confirmed_at,restaurant_confirmed_by,restaurant_review_note,restaurant_review_metadata,customer_notified_at,customer_notification_status,customer_notification_error,payment_confirmed_at,created_at,updated_at",
        id: `eq.${c.req.param("orderId")}`,
        limit: 1,
      },
    }),
    createSupabaseRestClient(c.env).select<CustomerRow>({
      schema: tenant.schema_name,
      table: "customers",
      query: {
        select: "id,phone,name",
        limit: 500,
      },
    }),
  ]);

  const order = updatedOrder[0];
  if (!order) {
    return c.json({ error: "order_not_found" }, 404);
  }

  const customerById = new Map(customers.map((entry) => [entry.id, entry]));
  return c.json(mapOrderSummary(order, customerById.get(order.customer_id)));
});

dashboardRoutes.post("/:tenantSlug/orders/:orderId/accept", async (c) => {
  const tenant = c.get("tenant");
  const authUser = c.get("authUser");
  const role = await getTenantUserRole(c.env, authUser.id, tenant.id);

  if (!role) {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = (await c.req.json().catch(() => ({}))) as AcceptOrderRequest;
  const context = await loadOrderNotificationContext(c.env, tenant.schema_name, c.req.param("orderId"));

  if (!context) {
    return c.json({ error: "order_not_found" }, 404);
  }

  if (context.order.status !== "pending_restaurant_confirmation") {
    return c.json({ error: "order_not_pending_restaurant_confirmation" }, 409);
  }

  const now = new Date().toISOString();
  const status = "accepted" as const;
  const conversationState = context.order.payment_method === "transfer" ? "awaiting_transfer_proof" : "completed";
  const [updated] = await createSupabaseRestClient(c.env).updateReturning<OrderRow>({
    schema: tenant.schema_name,
    table: "orders",
    query: { id: `eq.${context.order.id}` },
    patch: {
      status,
      restaurant_reviewed_at: now,
      restaurant_reviewed_by: authUser.id,
      restaurant_confirmed_at: now,
      restaurant_confirmed_by: authUser.id,
      restaurant_review_note: body.note ?? null,
      customer_notification_status: "pending",
      customer_notification_error: null,
      updated_at: now,
    },
  });

  if (context.draftOrder?.conversation_id) {
    await updateConversationState({
      env: c.env,
      schemaName: tenant.schema_name,
      conversationId: context.draftOrder.conversation_id,
      state: conversationState,
      resetClarificationAttempts: true,
    }).catch(() => undefined);
  }

  await createSupabaseRestClient(c.env).insert({
    schema: tenant.schema_name,
    table: "app_events",
    rows: {
      conversation_id: context.draftOrder?.conversation_id ?? null,
      draft_order_id: context.order.draft_order_id ?? null,
      order_id: context.order.id,
      event_name: "order.restaurant_accepted",
      severity: "info",
      source: "dashboard_api",
      metadata: {
        reviewedBy: authUser.id,
        note: body.note ?? null,
      },
    },
  }).catch(() => undefined);

  await resolvePendingConfirmationAlerts(c.env, tenant.schema_name, context.order.id).catch(() => undefined);

  const notificationText = buildAcceptedOrderMessage(updated ?? context.order, context.location);
  const finalOrder = await sendOrderCustomerNotification({
    env: c.env,
    schemaName: tenant.schema_name,
    context: {
      ...context,
      order: updated ?? context.order,
    },
    messageText: notificationText,
    notificationType: "accepted",
  });

  return c.json(mapOrderSummary(finalOrder, context.customer));
});

dashboardRoutes.post("/:tenantSlug/orders/:orderId/reject-out-of-stock", async (c) => {
  const tenant = c.get("tenant");
  const authUser = c.get("authUser");
  const role = await getTenantUserRole(c.env, authUser.id, tenant.id);

  if (!role) {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = await c.req.json<RejectOutOfStockOrderRequest>().catch(() => undefined);

  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ error: "invalid_out_of_stock_request" }, 400);
  }

  const context = await loadOrderNotificationContext(c.env, tenant.schema_name, c.req.param("orderId"));

  if (!context) {
    return c.json({ error: "order_not_found" }, 404);
  }

  if (context.order.status !== "pending_restaurant_confirmation") {
    return c.json({ error: "order_not_pending_restaurant_confirmation" }, 409);
  }

  const unavailableSelection = body.items[0];
  if (!unavailableSelection) {
    return c.json({ error: "invalid_out_of_stock_request" }, 400);
  }
  const orderItems = await createSupabaseRestClient(c.env).select<OrderItemRow>({
    schema: tenant.schema_name,
    table: "order_items",
    query: {
      select: "id,order_id,menu_item_id,product_id,combo_id,category_snapshot,name_snapshot,quantity,unit_price,options_snapshot,notes,line_total",
      order_id: `eq.${context.order.id}`,
    },
  });
  const unavailableItem = orderItems.find((item) => item.id === unavailableSelection.orderItemId);

  if (!unavailableItem) {
    return c.json({ error: "order_item_not_found" }, 404);
  }

  const replacementOptions = await resolveReplacementOptions({
    env: c.env,
    schemaName: tenant.schema_name,
    tenantTimezone: tenant.timezone,
    orderItem: unavailableItem,
    requestedReplacementMenuItemIds: unavailableSelection.replacementMenuItemIds ?? [],
  });

  if (replacementOptions.length === 0) {
    return c.json({ error: "replacement_options_not_found" }, 409);
  }

  if (unavailableSelection.markMenuItemUnavailable && unavailableItem.menu_item_id) {
    await createSupabaseRestClient(c.env).update({
      schema: tenant.schema_name,
      table: "menu_items",
      values: {
        is_available: false,
      },
      query: {
        id: `eq.${unavailableItem.menu_item_id}`,
      },
    }).catch(() => undefined);

    await createSupabaseRestClient(c.env).insert({
      schema: tenant.schema_name,
      table: "app_events",
      rows: {
        conversation_id: context.draftOrder?.conversation_id ?? null,
        draft_order_id: context.order.draft_order_id ?? null,
        order_id: context.order.id,
        event_name: "menu_item.marked_unavailable_from_order",
        severity: "info",
        source: "dashboard_api",
        metadata: {
          orderItemId: unavailableItem.id,
          menuItemId: unavailableItem.menu_item_id,
          reviewedBy: authUser.id,
        },
      },
    }).catch(() => undefined);
  }

  const reviewMetadata = {
    reason: "out_of_stock",
    unavailableOrderItemIds: [unavailableItem.id],
    unavailableItems: [
      {
        orderItemId: unavailableItem.id,
        menuItemId: unavailableItem.menu_item_id ?? undefined,
        productId: unavailableItem.product_id ?? undefined,
        comboId: unavailableItem.combo_id ?? undefined,
        name: unavailableItem.name_snapshot,
        quantity: unavailableItem.quantity,
        category: unavailableItem.category_snapshot ?? undefined,
      },
    ],
    replacementMenuItems: replacementOptions,
    markMenuItemsUnavailable: Boolean(unavailableSelection.markMenuItemUnavailable),
  };

  const now = new Date().toISOString();
  const [updated] = await createSupabaseRestClient(c.env).updateReturning<OrderRow>({
    schema: tenant.schema_name,
    table: "orders",
    query: { id: `eq.${context.order.id}` },
    patch: {
      status: "needs_customer_replacement",
      restaurant_reviewed_at: now,
      restaurant_reviewed_by: authUser.id,
      restaurant_review_note: body.note ?? null,
      restaurant_review_metadata: reviewMetadata,
      customer_notification_status: "pending",
      customer_notification_error: null,
      updated_at: now,
    },
  });

  if (context.draftOrder?.conversation_id) {
    await updateConversationState({
      env: c.env,
      schemaName: tenant.schema_name,
      conversationId: context.draftOrder.conversation_id,
      state: "awaiting_replacement_selection",
      resetClarificationAttempts: true,
    }).catch(() => undefined);
  }

  await createSupabaseRestClient(c.env).insert({
    schema: tenant.schema_name,
    table: "app_events",
    rows: {
      conversation_id: context.draftOrder?.conversation_id ?? null,
      draft_order_id: context.order.draft_order_id ?? null,
      order_id: context.order.id,
      event_name: "order.out_of_stock_returned_to_customer",
      severity: "info",
      source: "dashboard_api",
      metadata: {
        reviewedBy: authUser.id,
        note: body.note ?? null,
        reviewMetadata,
      },
    },
  }).catch(() => undefined);

  await resolvePendingConfirmationAlerts(c.env, tenant.schema_name, context.order.id).catch(() => undefined);

  const notificationText = buildOutOfStockMessage(unavailableItem.name_snapshot, replacementOptions);
  const finalOrder = await sendOrderCustomerNotification({
    env: c.env,
    schemaName: tenant.schema_name,
    context: {
      ...context,
      order: updated ?? context.order,
    },
    messageText: notificationText,
    notificationType: "out_of_stock",
  });

  return c.json(mapOrderSummary(finalOrder, context.customer));
});

dashboardRoutes.post("/:tenantSlug/orders/:orderId/customer-notification/retry", async (c) => {
  const tenant = c.get("tenant");
  const authUser = c.get("authUser");
  const role = await getTenantUserRole(c.env, authUser.id, tenant.id);

  if (!role) {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = await c.req.json<RetryOrderCustomerNotificationRequest>().catch(() => undefined);

  if (!body?.type) {
    return c.json({ error: "invalid_customer_notification_retry_request" }, 400);
  }

  const context = await loadOrderNotificationContext(c.env, tenant.schema_name, c.req.param("orderId"));

  if (!context) {
    return c.json({ error: "order_not_found" }, 404);
  }

  const messageText = buildRetryNotificationMessage(body.type, context.order, context.location);

  if (!messageText) {
    return c.json({ error: "customer_notification_retry_not_available" }, 409);
  }

  const finalOrder = await sendOrderCustomerNotification({
    env: c.env,
    schemaName: tenant.schema_name,
    context,
    messageText,
    notificationType: body.type,
  });

  return c.json(mapOrderSummary(finalOrder, context.customer));
});

dashboardRoutes.patch("/:tenantSlug/orders/:orderId/status", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json<{
    status?: OrderStatus;
    restaurantConfirmed?: boolean;
    paymentConfirmed?: boolean;
  }>();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    updated_at: now,
  };

  if (body.status !== undefined) {
    patch.status = body.status;
  }

  if (body.restaurantConfirmed === true) {
    patch.restaurant_confirmed_at = now;
  }

  if (body.restaurantConfirmed === false) {
    patch.restaurant_confirmed_at = null;
  }

  if (body.paymentConfirmed === true) {
    patch.payment_confirmed_at = now;
  }

  if (body.paymentConfirmed === false) {
    patch.payment_confirmed_at = null;
  }

  let order: OrderRow | undefined;

  try {
    [order] = await createSupabaseRestClient(c.env).updateReturning<OrderRow>({
      schema: tenant.schema_name,
      table: "orders",
      query: { id: `eq.${c.req.param("orderId")}` },
      patch,
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return c.json({ error: "order_module_unavailable" }, 404);
    }

    throw error;
  }

  if (!order) {
    return c.json({ error: "order_not_found" }, 404);
  }

  const [customer] = await createSupabaseRestClient(c.env).select<CustomerRow>({
    schema: tenant.schema_name,
    table: "customers",
    query: {
      select: "id,phone,name",
      id: `eq.${order.customer_id}`,
      limit: 1,
    },
  });

  return c.json(mapOrderSummary(order, customer));
});

dashboardRoutes.get("/:tenantSlug/alerts", async (c) => {
  const tenant = c.get("tenant");
  let alerts: AlertRow[] = [];

  try {
    alerts = await selectAlerts(createSupabaseRestClient(c.env), tenant.schema_name, {
      status: c.req.query("status") as HumanInterventionStatus | undefined,
      limit: 200,
    });
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  return c.json(alerts.map(mapAlert));
});

dashboardRoutes.patch("/:tenantSlug/alerts/:alertId/acknowledge", async (c) => {
  const tenant = c.get("tenant");
  let alert: AlertRow | undefined;

  try {
    [alert] = await createSupabaseRestClient(c.env).updateReturning<AlertRow>({
      schema: tenant.schema_name,
      table: "human_intervention_alerts",
      query: {
        id: `eq.${c.req.param("alertId")}`,
      },
      patch: {
        status: "acknowledged",
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return c.json({ error: "order_module_unavailable" }, 404);
    }

    throw error;
  }

  if (!alert) {
    return c.json({ error: "alert_not_found" }, 404);
  }

  return c.json(mapAlert(alert));
});

dashboardRoutes.patch("/:tenantSlug/alerts/:alertId/resolve", async (c) => {
  const tenant = c.get("tenant");
  let alert: AlertRow | undefined;

  try {
    [alert] = await createSupabaseRestClient(c.env).updateReturning<AlertRow>({
      schema: tenant.schema_name,
      table: "human_intervention_alerts",
      query: {
        id: `eq.${c.req.param("alertId")}`,
      },
      patch: {
        status: "resolved",
        resolved_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return c.json({ error: "order_module_unavailable" }, 404);
    }

    throw error;
  }

  if (!alert) {
    return c.json({ error: "alert_not_found" }, 404);
  }

  return c.json(mapAlert(alert));
});

dashboardRoutes.get("/:tenantSlug/settings/automation", async (c) => {
  const tenant = c.get("tenant");
  const [location] = await createSupabaseRestClient(c.env).select<LocationRow>({
    schema: tenant.schema_name,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,automation_enabled,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  const payload: AutomationSettings = {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantAutomationEnabled: true,
    locationAutomationEnabled: location?.automation_enabled,
  };

  const [tenantRow] = await createSupabaseRestClient(c.env).select<TenantRow & { automation_enabled: boolean }>({
    schema: "control",
    table: "tenants",
    query: {
      select: "id,slug,schema_name,timezone,automation_enabled",
      id: `eq.${tenant.id}`,
      limit: 1,
    },
  });

  payload.tenantAutomationEnabled = tenantRow?.automation_enabled ?? true;

  return c.json(payload);
});

dashboardRoutes.patch("/:tenantSlug/settings/automation", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json<{ enabled: boolean }>();
  const supabase = createSupabaseRestClient(c.env);
  const [location] = await supabase.select<LocationRow>({
    schema: tenant.schema_name,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,automation_enabled,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  await Promise.all([
    supabase.update({
      schema: "control",
      table: "tenants",
      values: {
        automation_enabled: body.enabled,
        updated_at: new Date().toISOString(),
      },
      query: {
        id: `eq.${tenant.id}`,
      },
    }),
    location
      ? supabase.update({
          schema: tenant.schema_name,
          table: "locations",
          values: {
            automation_enabled: body.enabled,
            updated_at: new Date().toISOString(),
          },
          query: {
            id: `eq.${location.id}`,
          },
        })
      : Promise.resolve([]),
  ]);

  return c.json({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantAutomationEnabled: body.enabled,
    locationAutomationEnabled: location ? body.enabled : undefined,
  } satisfies AutomationSettings);
});

dashboardRoutes.post("/:tenantSlug/products", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json<Partial<Product>>();
  const supabase = createSupabaseRestClient(c.env);
  const rows = {
    name: body.name,
    description: body.description ?? null,
    base_price: body.basePrice ?? 0,
    category: body.category ?? null,
    emoji: body.emoji ?? null,
    product_type: body.productType ?? "simple",
    ...(body.imageUrl !== undefined ? { image_url: body.imageUrl } : {}),
    is_active: body.isActive ?? true,
  };
  let productRows: ProductRow[];

  try {
    productRows = await supabase.insertReturning<ProductRow>({
      schema: tenant.schema_name,
      table: "products",
      rows,
    });
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 400 && (error.body.includes("image_url") || error.body.includes("emoji"))) {
      const { emoji: _emoji, image_url: _imageUrl, ...rowsWithoutOptionalVisuals } = rows;
      productRows = await supabase.insertReturning<ProductRow>({
        schema: tenant.schema_name,
        table: "products",
        rows: rowsWithoutOptionalVisuals,
      });
    } else {
      throw error;
    }
  }

  const [product] = productRows;

  if (!product) {
    return c.json({ error: "product_create_failed" }, 500);
  }

  await replaceProductOptions(supabase, tenant.schema_name, product.id, body.productType === "composite" ? body.options ?? [] : []);
  const options = await selectProductOptions(supabase, tenant.schema_name, [product.id]);

  return c.json(mapProduct(product, options.get(product.id)), 201);
});

dashboardRoutes.post("/:tenantSlug/uploads/menu-image/analyze", async (c) => {
  const form = await c.req.parseBody();
  const file = form.file;

  if (!(file instanceof File)) {
    return c.json({ error: "image_file_required" }, 400);
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return c.json({ error: "unsupported_image_type" }, 400);
  }

  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "replace-me") {
    return c.json({ error: "gemini_not_configured" }, 500);
  }

  const imageBase64 = arrayBufferToBase64(await file.arrayBuffer());
  const prompt = [
    "Eres un extractor de menus de restaurante en Colombia. Tu prioridad es capturar nombre, precio, categoria y descripcion completa de cada plato.",
    "Lee la imagen y devuelve SOLO JSON valido, sin markdown.",
    "Extrae platos vendibles del menu con precio en COP.",
    "Si un precio tiene puntos o separadores, conviertelo a entero.",
    "Ignora encabezados, horarios, telefonos, redes sociales y textos decorativos.",
    "La descripcion es obligatoria cuando exista texto debajo o al lado del nombre del plato.",
    "Para desayunos, la descripcion suele ser la linea siguiente con ingredientes como arepa, huevos, cafe, queso, pan o frutas.",
    "Para almuerzos, conserva acompanamientos e ingredientes: entrada, principio, seco, carne, ensalada, papas, arroz, bebida, etc.",
    "Para adiciones, si no hay descripcion separada, usa el mismo nombre como descripcion corta.",
    "Clasifica category usando una de estas etiquetas cuando aplique: desayuno, almuerzo, adicion. Si no aplica, usa otra categoria corta en singular.",
    "No inventes ingredientes que no aparezcan. Si una descripcion continua en varias lineas, unelas en una sola frase.",
    "Si el precio dice 'segun pescado', 'segun peso' o similar y no hay numero, omite ese producto.",
    'Formato exacto: {"products":[{"name":"string","description":"string","basePrice":12345,"category":"string","confidence":0.9}]}',
    "Usa nombres cortos y claros. No dejes description vacio si la imagen muestra ingredientes o acompanamientos.",
    "Si no detectas platos, devuelve {\"products\":[]}.",
  ].join("\n");

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: file.type,
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        response_mime_type: "application/json",
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("gemini_menu_analysis_failed", { status: response.status, body: errorText.slice(0, 500) });
    if (response.status === 429) {
      return c.json({ error: "gemini_quota_exhausted" }, 429);
    }

    return c.json({ error: "gemini_menu_analysis_failed" }, 502);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  const products = parseGeminiMenuProducts(text);

  return c.json({ products });
});

dashboardRoutes.post("/:tenantSlug/uploads/menu-file/analyze", async (c) => {
  const form = await c.req.parseBody();
  const file = form.file;

  if (!(file instanceof File)) {
    return c.json({ error: "menu_file_required" }, 400);
  }

  try {
    const result = await processMenuFile({
      env: c.env,
      file,
    });

    return c.json(result);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "menu_file_analysis_failed";
    if (reason === "unsupported_menu_file_type") return c.json({ error: reason }, 415);
    if (reason === "gemini_not_configured") return c.json({ error: reason }, 500);
    if (reason === "gemini_quota_exhausted") return c.json({ error: reason }, 429);

    console.error("menu_file_analysis_failed", { reason });
    return c.json({ error: "menu_file_analysis_failed" }, 502);
  }
});

dashboardRoutes.post("/:tenantSlug/uploads/product-image", async (c) => {
  const tenant = c.get("tenant");
  const form = await c.req.parseBody();
  const file = form.file;

  if (!(file instanceof File)) {
    return c.json({ error: "image_file_required" }, 400);
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return c.json({ error: "unsupported_image_type" }, 400);
  }

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `${tenant.slug}/products/${crypto.randomUUID()}.${extension}`;
  const upload = await createSupabaseRestClient(c.env).uploadObject({
    bucket: "product-images",
    path: storagePath,
    body: file,
    contentType: file.type,
  });

  return c.json({
    bucket: "product-images",
    path: upload.path,
    publicUrl: upload.publicUrl,
  });
});

dashboardRoutes.patch("/:tenantSlug/products/:productId", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json<Partial<Product>>();
  const [product] = await createSupabaseRestClient(c.env).updateReturning<ProductRow>({
    schema: tenant.schema_name,
    table: "products",
    query: { id: `eq.${c.req.param("productId")}` },
    patch: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.basePrice !== undefined ? { base_price: body.basePrice } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(body.emoji !== undefined ? { emoji: body.emoji } : {}),
      ...(body.productType !== undefined ? { product_type: body.productType } : {}),
      ...(body.imageUrl !== undefined ? { image_url: body.imageUrl } : {}),
      ...(body.isActive !== undefined ? { is_active: body.isActive } : {}),
      updated_at: new Date().toISOString(),
    },
  });

  if (!product) {
    return c.json({ error: "product_not_found" }, 404);
  }

  if (body.productType !== undefined || body.options !== undefined) {
    await replaceProductOptions(createSupabaseRestClient(c.env), tenant.schema_name, product.id, body.productType === "composite" ? body.options ?? [] : []);
  }

  const options = await selectProductOptions(createSupabaseRestClient(c.env), tenant.schema_name, [product.id]);

  return c.json(mapProduct(product, options.get(product.id)));
});

dashboardRoutes.get("/:tenantSlug/diagnostics", async (c) => {
  const tenant = c.get("tenant");
  const supabase = createSupabaseRestClient(c.env);
  const checks: Record<string, boolean | string> = {
    tenant: tenant.slug,
    schema: tenant.schema_name,
    productsTable: false,
    productImageColumn: false,
    productImagesBucket: false,
  };

  try {
    await supabase.select<ProductRow>({
      schema: tenant.schema_name,
      table: "products",
      query: {
        select: "id",
        limit: 1,
      },
    });
    checks.productsTable = true;
  } catch {
    checks.productsTable = false;
  }

  try {
    await supabase.select<ProductRow>({
      schema: tenant.schema_name,
      table: "products",
      query: {
        select: "image_url",
        limit: 1,
      },
    });
    checks.productImageColumn = true;
  } catch {
    checks.productImageColumn = false;
  }

  const bucketResponse = await fetch(`${c.env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/bucket/product-images`, {
    headers: {
      apikey: c.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  checks.productImagesBucket = bucketResponse.ok;

  return c.json(checks);
});

dashboardRoutes.delete("/:tenantSlug/products/:productId", async (c) => {
  const tenant = c.get("tenant");
  await createSupabaseRestClient(c.env).updateReturning<ProductRow>({
    schema: tenant.schema_name,
    table: "products",
    query: { id: `eq.${c.req.param("productId")}` },
    patch: {
      is_active: false,
      updated_at: new Date().toISOString(),
    },
  });

  return c.json({ ok: true });
});

dashboardRoutes.post("/:tenantSlug/menu/today/items", async (c) => {
  const tenant = c.get("tenant");
  const supabase = createSupabaseRestClient(c.env);
  const body = await c.req.json<{ productId: string; date?: string }>();
  const menu = await findOrCreateTodayMenu(supabase, tenant.schema_name, tenant.timezone, body.date);
  const nextSortOrder = await getNextMenuSortOrder(supabase, tenant.schema_name, menu.id);
  const [product] = await selectProducts(supabase, tenant.schema_name, {
      id: `eq.${body.productId}`,
      is_active: "eq.true",
      limit: 1,
  });

  if (!product) {
    return c.json({ error: "product_not_found" }, 404);
  }

  const [item] = await supabase.insertReturning<MenuItemRow>({
    schema: tenant.schema_name,
    table: "menu_items",
    rows: {
      menu_id: menu.id,
      product_id: product.id,
      display_name: product.name,
      price_override: product.base_price,
      is_available: true,
      sort_order: nextSortOrder,
    },
  });

  if (!item) {
    return c.json({ error: "menu_item_create_failed" }, 500);
  }

  return c.json(mapMenuItem(item, mapProduct(product)), 201);
});

dashboardRoutes.patch("/:tenantSlug/menu/today/items/:itemId", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json<Partial<MenuItem>>();
  const [item] = await createSupabaseRestClient(c.env).updateReturning<MenuItemRow>({
    schema: tenant.schema_name,
    table: "menu_items",
    query: { id: `eq.${c.req.param("itemId")}` },
    patch: {
      ...(body.displayName !== undefined ? { display_name: body.displayName } : {}),
      ...(body.priceOverride !== undefined ? { price_override: body.priceOverride } : {}),
      ...(body.availableQuantity !== undefined ? { available_quantity: body.availableQuantity } : {}),
      ...(body.isAvailable !== undefined ? { is_available: body.isAvailable } : {}),
      ...(body.sortOrder !== undefined ? { sort_order: body.sortOrder } : {}),
    },
  });

  if (!item) {
    return c.json({ error: "menu_item_not_found" }, 404);
  }

  return c.json(mapMenuItem(item));
});

dashboardRoutes.delete("/:tenantSlug/menu/today/items/:itemId", async (c) => {
  const tenant = c.get("tenant");
  await createSupabaseRestClient(c.env).delete({
    schema: tenant.schema_name,
    table: "menu_items",
    query: { id: `eq.${c.req.param("itemId")}` },
  });

  return c.json({ ok: true });
});

async function findOrCreateTodayMenu(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  timezone?: string,
  requestedDate?: string,
): Promise<MenuRow> {
  const date = resolveBusinessDate(requestedDate, timezone);
  const [location] = await supabase.select<LocationRow>({
    schema,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  if (!location) {
    throw new Error("active_location_not_found");
  }

  const [existing] = await supabase.select<MenuRow>({
    schema,
    table: "menus",
    query: {
      select: "id,location_id,date,name,status,published_at",
      location_id: `eq.${location.id}`,
      date: `eq.${date}`,
      limit: 1,
    },
  });

  if (existing) {
    return existing;
  }

  const [menu] = await supabase.insertReturning<MenuRow>({
    schema,
    table: "menus",
    rows: {
      location_id: location.id,
      date,
      name: "Menu de hoy",
      status: "published",
      published_at: new Date().toISOString(),
    },
  });

  if (!menu) {
    throw new Error("menu_create_failed");
  }

  return menu;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function parseGeminiMenuProducts(text: string): GeminiMenuProduct[] {
  const normalized = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(normalized) as { products?: unknown[] };

  return (parsed.products ?? [])
    .map((entry) => {
      const product = entry as Partial<GeminiMenuProduct>;
      return {
        name: String(product.name ?? "").trim(),
        description: product.description ? String(product.description).trim() : undefined,
        basePrice: Number(product.basePrice ?? 0),
        category: product.category ? String(product.category).trim() : undefined,
        confidence: product.confidence === undefined ? undefined : Number(product.confidence),
      };
    })
    .filter((product) => product.name && Number.isFinite(product.basePrice) && product.basePrice > 0)
    .slice(0, 30);
}

async function selectProducts(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  query: Record<string, string | number | boolean | undefined> = {},
): Promise<ProductRow[]> {
  try {
    return await supabase.select<ProductRow>({
      schema,
      table: "products",
      query: {
        select: "id,name,description,base_price,category,emoji,product_type,image_url,is_active",
        order: "name.asc",
        is_active: "eq.true",
        ...query,
      },
    });
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 400 && (error.body.includes("image_url") || error.body.includes("emoji"))) {
      return supabase.select<ProductRow>({
        schema,
        table: "products",
        query: {
          select: "id,name,description,base_price,category,is_active",
          order: "name.asc",
          is_active: "eq.true",
          ...query,
        },
      });
    }

    throw error;
  }
}

async function getNextMenuSortOrder(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  menuId: string,
): Promise<number> {
  const [lastItem] = await supabase.select<Pick<MenuItemRow, "sort_order">>({
    schema,
    table: "menu_items",
    query: {
      select: "sort_order",
      menu_id: `eq.${menuId}`,
      order: "sort_order.desc",
      limit: 1,
    },
  });

  return (lastItem?.sort_order ?? 0) + 10;
}

async function selectProductOptions(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  productIds: string[],
): Promise<Map<string, Product["options"]>> {
  const optionsByProductId = new Map<string, Product["options"]>();
  if (productIds.length === 0) return optionsByProductId;

  let optionRows: ProductOptionRow[] = [];

  try {
    optionRows = await supabase.select<ProductOptionRow>({
      schema,
      table: "product_options",
      query: {
        select: "id,product_id,name,description,type,is_required,min_select,max_select,sort_order,display_mode",
        product_id: `in.(${productIds.join(",")})`,
        order: "sort_order.asc",
      },
    });
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404) return optionsByProductId;
    throw error;
  }

  const optionIds = optionRows.map((option) => option.id);
  const valuesByOptionId = new Map<string, ProductOptionValueRow[]>();

  if (optionIds.length > 0) {
    const valueRows = await supabase.select<ProductOptionValueRow>({
      schema,
      table: "product_option_values",
      query: {
        select: "id,option_id,name,description,price_delta,is_active,sort_order",
        option_id: `in.(${optionIds.join(",")})`,
        order: "sort_order.asc",
      },
    });

    valueRows.forEach((value) => {
      const values = valuesByOptionId.get(value.option_id) ?? [];
      values.push(value);
      valuesByOptionId.set(value.option_id, values);
    });
  }

  optionRows.forEach((option) => {
    const values = valuesByOptionId.get(option.id) ?? [];
    const mappedOptions = optionsByProductId.get(option.product_id) ?? [];
    mappedOptions.push({
      id: option.id,
      name: option.name,
      description: option.description ?? undefined,
      type: option.type,
      isRequired: option.is_required,
      minSelect: option.min_select,
      maxSelect: option.max_select,
      sortOrder: option.sort_order ?? 0,
      displayMode: option.display_mode ?? "list",
      values: values.map((value) => ({
        id: value.id,
        name: value.name,
        description: value.description ?? undefined,
        priceDelta: value.price_delta,
        isActive: value.is_active,
        sortOrder: value.sort_order ?? 0,
      })),
    });
    optionsByProductId.set(option.product_id, mappedOptions);
  });

  return optionsByProductId;
}

async function replaceProductOptions(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  productId: string,
  options: Product["options"] = [],
) {
  const existingOptions = await supabase.select<ProductOptionRow>({
    schema,
    table: "product_options",
    query: {
      select: "id,product_id,name,type,is_required,min_select,max_select",
      product_id: `eq.${productId}`,
    },
  });

  for (const option of existingOptions) {
    await supabase.delete({
      schema,
      table: "product_option_values",
      query: { option_id: `eq.${option.id}` },
    });
  }

  await supabase.delete({
    schema,
    table: "product_options",
    query: { product_id: `eq.${productId}` },
  });

  const optionRows = (options ?? [])
    .filter((option) => option.name.trim())
    .map((option, index) => ({
      product_id: productId,
      name: option.name.trim(),
      description: option.description?.trim() || null,
      type: option.type,
      is_required: option.isRequired,
      min_select: option.minSelect,
      max_select: option.maxSelect,
      sort_order: option.sortOrder ?? index * 10,
      display_mode: option.displayMode ?? "list",
    }));

  if (optionRows.length === 0) return;

  const insertedOptions = await supabase.insertReturning<ProductOptionRow>({
    schema,
    table: "product_options",
    rows: optionRows,
  });

  const valueRows = insertedOptions.flatMap((insertedOption, optionIndex) => {
    const sourceOption = options[optionIndex];
    return (sourceOption?.values ?? [])
      .filter((value) => value.name.trim())
      .map((value, valueIndex) => ({
        option_id: insertedOption.id,
        name: value.name.trim(),
        description: value.description?.trim() || null,
        price_delta: value.priceDelta ?? 0,
        is_active: value.isActive ?? true,
        sort_order: value.sortOrder ?? valueIndex * 10,
      }));
  });

  if (valueRows.length > 0) {
    await supabase.insert({
      schema,
      table: "product_option_values",
      rows: valueRows,
    });
  }
}

async function selectAlerts(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  options: {
    status?: HumanInterventionStatus;
    limit?: number;
  } = {},
): Promise<AlertRow[]> {
  return supabase.select<AlertRow>({
    schema,
    table: "human_intervention_alerts",
    query: {
      select: "id,conversation_id,draft_order_id,order_id,type,status,title,description,metadata,created_at,resolved_at",
      ...(options.status ? { status: `eq.${options.status}` } : {}),
      order: "created_at.desc",
      limit: options.limit ?? 100,
    },
  });
}

function parseOrdersBucket(rawBucket?: string): OrdersBucket {
  if (rawBucket === "pending_confirmation" || rawBucket === "active" || rawBucket === "history" || rawBucket === "all") {
    return rawBucket;
  }

  return "pending_confirmation";
}

function parsePositiveInt(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOrderStatusFilter(rawStatus?: string): OrderStatus | undefined {
  if (!rawStatus) {
    return undefined;
  }

  return [
    "new",
    "pending_restaurant_confirmation",
    "needs_customer_replacement",
    "payment_pending_review",
    "accepted",
    "preparing",
    "on_the_way",
    "delivered",
    "cancelled",
  ].includes(rawStatus)
    ? (rawStatus as OrderStatus)
    : undefined;
}

function matchesOrdersBucket(order: OrderSummary, bucket: OrdersBucket): boolean {
  if (bucket === "all") {
    return true;
  }

  if (bucket === "pending_confirmation") {
    return ["new", "pending_restaurant_confirmation", "needs_customer_replacement"].includes(order.status);
  }

  if (bucket === "active") {
    return ["accepted", "payment_pending_review", "preparing", "on_the_way"].includes(order.status);
  }

  return ["delivered", "cancelled"].includes(order.status);
}

function mapOrderSummary(row: OrderRow, customer?: CustomerRow): OrderSummary {
  return {
    id: row.id,
    draftOrderId: row.draft_order_id ?? undefined,
    customerId: row.customer_id,
    customerPhone: customer?.phone,
    customerName: customer?.name,
    status: row.status,
    fulfillmentType: row.fulfillment_type,
    serviceTiming: row.service_timing ?? "asap",
    scheduledFor: row.scheduled_for ?? undefined,
    paymentMethod: row.payment_method,
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee,
    discountTotal: row.discount_total,
    total: row.total,
    restaurantReviewedAt: row.restaurant_reviewed_at ?? undefined,
    restaurantReviewedBy: row.restaurant_reviewed_by ?? undefined,
    restaurantConfirmedAt: row.restaurant_confirmed_at ?? undefined,
    restaurantConfirmedBy: row.restaurant_confirmed_by ?? undefined,
    restaurantReviewNote: row.restaurant_review_note ?? undefined,
    restaurantReviewMetadata: row.restaurant_review_metadata ?? undefined,
    customerNotifiedAt: row.customer_notified_at ?? undefined,
    customerNotificationStatus: row.customer_notification_status ?? undefined,
    customerNotificationError: row.customer_notification_error ?? undefined,
    paymentConfirmedAt: row.payment_confirmed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPaymentProofDownloadError(
  c: Context<{ Bindings: ApiBindings; Variables: DashboardVariables }>,
  tenantSlug: string,
  orderId: string,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("dashboard.payment_proof_download_failed", {
    tenantSlug,
    orderId,
    error: message,
  });

  if (message.startsWith("payment_proof.sign_url_failed:")) {
    return c.json({ error: "payment_proof_storage_sign_failed" }, 502);
  }

  if (message === "payment_proof.sign_url_invalid") {
    return c.json({ error: "payment_proof_storage_sign_invalid" }, 502);
  }

  if (message.startsWith("payment_proof.signed_download_failed:404")) {
    return c.json({ error: "payment_proof_storage_download_failed" }, 502);
  }

  if (message.startsWith("payment_proof.signed_download_failed:")) {
    return c.json({ error: "payment_proof_storage_access_failed" }, 502);
  }

  throw error;
}

function mapOrderLineItem(row: OrderItemRow): OrderLineItem {
  return {
    id: row.id,
    menuItemId: row.menu_item_id ?? undefined,
    productId: row.product_id ?? undefined,
    comboId: row.combo_id ?? undefined,
    categorySnapshot: row.category_snapshot ?? undefined,
    name: row.name_snapshot,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    options: row.options_snapshot ?? undefined,
    notes: row.notes ?? undefined,
    lineTotal: row.line_total,
  };
}

function mapAlert(row: AlertRow): HumanInterventionAlert {
  return {
    id: row.id,
    conversationId: row.conversation_id ?? undefined,
    draftOrderId: row.draft_order_id ?? undefined,
    orderId: row.order_id ?? undefined,
    type: row.type as HumanInterventionAlert["type"],
    status: row.status,
    title: row.title,
    description: row.description ?? undefined,
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
  };
}

function isMissingTableError(error: unknown): error is SupabaseRestError {
  return (
    error instanceof SupabaseRestError &&
    (error.body.includes("Could not find the table") ||
      error.body.includes("relation") ||
      error.body.includes("does not exist"))
  );
}

function mapLocation(row: LocationRow) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    deliveryFeeFixed: row.delivery_fee_fixed,
    isActive: row.is_active,
  };
}

function mapProduct(row: ProductRow, options?: Product["options"]): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    basePrice: row.base_price,
    category: row.category,
    emoji: row.emoji ?? undefined,
    imageUrl: row.image_url,
    productType: row.product_type ?? "simple",
    options: options ?? [],
    isActive: row.is_active,
  };
}

function mapMenu(row: MenuRow): Menu {
  return {
    id: row.id,
    locationId: row.location_id,
    date: row.date,
    name: row.name,
    status: row.status,
    publishedAt: row.published_at,
  };
}

function mapMenuItem(row: MenuItemRow, product?: Product): MenuItem {
  return {
    id: row.id,
    menuId: row.menu_id,
    productId: row.product_id,
    comboId: row.combo_id,
    displayName: row.display_name,
    priceOverride: row.price_override,
    availableQuantity: row.available_quantity,
    isAvailable: row.is_available,
    sortOrder: row.sort_order,
    product,
  };
}

function resolveBusinessDate(requestedDate?: string, timezone = "America/Bogota"): string {
  if (requestedDate) {
    return requestedDate;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date().toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

async function loadOrderNotificationContext(
  env: ApiBindings,
  schema: string,
  orderId: string,
): Promise<OrderNotificationContext | undefined> {
  const supabase = createSupabaseRestClient(env);
  const [order] = await supabase.select<OrderRow>({
    schema,
    table: "orders",
    query: {
      select:
        "id,draft_order_id,customer_id,location_id,status,fulfillment_type,service_timing,scheduled_for,delivery_address,delivery_address_id,payment_method,payment_proof_file_id,subtotal,delivery_fee,discount_total,total,restaurant_reviewed_at,restaurant_reviewed_by,restaurant_confirmed_at,restaurant_confirmed_by,restaurant_review_note,restaurant_review_metadata,customer_notified_at,customer_notification_status,customer_notification_error,payment_confirmed_at,created_at,updated_at",
      id: `eq.${orderId}`,
      limit: 1,
    },
  });

  if (!order) {
    return undefined;
  }

  const [customer, draftOrder, location] = await Promise.all([
    supabase.select<CustomerRow>({
      schema,
      table: "customers",
      query: {
        select: "id,phone,name",
        id: `eq.${order.customer_id}`,
        limit: 1,
      },
    }),
    order.draft_order_id
      ? supabase.select<DraftOrderRow>({
          schema,
          table: "draft_orders",
          query: {
            select: "id,conversation_id",
            id: `eq.${order.draft_order_id}`,
            limit: 1,
          },
        })
      : Promise.resolve([]),
    order.location_id
      ? supabase.select<LocationRow>({
          schema,
          table: "locations",
          query: {
            select: "id,name,address,phone,delivery_fee_fixed,transfer_payment_instructions,automation_enabled,is_active",
            id: `eq.${order.location_id}`,
            limit: 1,
          },
        })
      : Promise.resolve([]),
  ]);

  if (!customer[0]) {
    throw new Error("order.customer_not_found");
  }

  return {
    order,
    customer: customer[0],
    draftOrder: draftOrder[0],
    location: location[0],
  };
}

async function resolvePendingConfirmationAlerts(env: ApiBindings, schema: string, orderId: string): Promise<void> {
  await createSupabaseRestClient(env).update({
    schema,
    table: "human_intervention_alerts",
    values: {
      status: "resolved",
      resolved_at: new Date().toISOString(),
    },
    query: {
      order_id: `eq.${orderId}`,
      type: "eq.order_pending_confirmation",
      status: "in.(open,acknowledged)",
    },
  });
}

async function resolveLunchReminderRecipients(
  env: ApiBindings,
  schemaName: string,
): Promise<LunchReminderRecipient[]> {
  const supabase = createSupabaseRestClient(env);
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  let orders: Array<Pick<OrderRow, "id" | "draft_order_id" | "customer_id" | "created_at">> = [];

  try {
    orders = await supabase.select<ArrayElement<typeof orders>>({
      schema: schemaName,
      table: "orders",
      query: {
        select: "id,draft_order_id,customer_id,created_at",
        created_at: `gte.${since}`,
        status: "neq.cancelled",
        order: "created_at.desc",
        limit: 500,
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }

  const customerIds = Array.from(new Set(orders.map((order) => order.customer_id).filter(Boolean)));
  if (customerIds.length === 0) return [];

  const customers = await supabase.select<CustomerRow>({
    schema: schemaName,
    table: "customers",
    query: {
      select: "id,phone,name",
      id: `in.(${customerIds.join(",")})`,
      limit: customerIds.length,
    },
  });
  const customerById = new Map(customers.filter((customer) => customer.phone).map((customer) => [customer.id, customer]));
  const draftOrderIds = Array.from(new Set(orders.map((order) => order.draft_order_id).filter((id): id is string => Boolean(id))));
  const draftOrders = draftOrderIds.length > 0
    ? await supabase.select<DraftOrderRow>({
        schema: schemaName,
        table: "draft_orders",
        query: {
          select: "id,conversation_id",
          id: `in.(${draftOrderIds.join(",")})`,
          limit: draftOrderIds.length,
        },
      }).catch((error) => {
        if (isMissingTableError(error)) return [];
        throw error;
      })
    : [];
  const conversationByDraftOrderId = new Map(draftOrders.map((draftOrder) => [draftOrder.id, draftOrder.conversation_id ?? undefined]));
  const recipientsByPhone = new Map<string, LunchReminderRecipient>();

  for (const order of orders) {
    const customer = customerById.get(order.customer_id);
    if (!customer) continue;

    const phoneKey = normalizePhoneKey(customer.phone);
    if (!phoneKey || recipientsByPhone.has(phoneKey)) continue;

    recipientsByPhone.set(phoneKey, {
      customer,
      order,
      conversationId: order.draft_order_id ? conversationByDraftOrderId.get(order.draft_order_id) : undefined,
    });
  }

  return [...recipientsByPhone.values()];
}

async function resolveLunchReminderMenuItems(
  env: ApiBindings,
  schemaName: string,
  timezone?: string,
): Promise<LunchReminderMenuItem[]> {
  const supabase = createSupabaseRestClient(env);
  const activeMenuId = await resolveActiveMenuId(supabase, schemaName, timezone);
  if (!activeMenuId) return [];

  const menuItems = await supabase.select<MenuItemRow>({
    schema: schemaName,
    table: "menu_items",
    query: {
      select: "id,menu_id,product_id,combo_id,display_name,price_override,available_quantity,is_available,sort_order",
      menu_id: `eq.${activeMenuId}`,
      is_available: "eq.true",
      order: "sort_order.asc",
      limit: 20,
    },
  });
  const productIds = menuItems
    .map((item) => item.product_id)
    .filter((value): value is string => Boolean(value));
  const products = productIds.length > 0
    ? await selectProducts(supabase, schemaName, {
        id: `in.(${productIds.join(",")})`,
      })
    : [];
  const productById = new Map(products.map((product) => [product.id, product]));

  const reminderItems: LunchReminderMenuItem[] = [];

  for (const item of menuItems) {
    const product = item.product_id ? productById.get(item.product_id) : undefined;
    const name = item.display_name || product?.name;
    if (!name) continue;

    reminderItems.push({
      name,
      price: item.price_override ?? product?.base_price,
      category: product?.category,
    });
  }

  return reminderItems;
}

function buildLunchReminderMessage(input: {
  restaurantName: string;
  customerName?: string;
  menuItems: LunchReminderMenuItem[];
}): string {
  const firstName = input.customerName?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hola ${firstName}!` : "Hola!";
  const itemLines = input.menuItems
    .slice(0, 8)
    .map((item, index) => `${index + 1}. ${item.name}${item.price !== undefined ? ` - ${formatCop(item.price)}` : ""}`);
  const remainingCount = Math.max(input.menuItems.length - itemLines.length, 0);

  return [
    `${greeting} Hoy en ${input.restaurantName} tenemos un menu lleno de platos deliciosos listos para ti:`,
    itemLines.join("\n"),
    remainingCount > 0 ? `Y ${remainingCount} opcion${remainingCount === 1 ? "" : "es"} mas disponible${remainingCount === 1 ? "" : "s"}.` : "",
    "Si quieres, responde por aqui con el plato que se te antoje y te ayudamos a dejar tu pedido listo.",
  ].filter(Boolean).join("\n\n");
}

function normalizePhoneKey(phone: string): string {
  return phone.replace(/\D/g, "");
}

type ArrayElement<T> = T extends Array<infer Value> ? Value : never;

function buildAcceptedOrderMessage(order: OrderRow, location?: LocationRow): string {
  if (order.payment_method === "transfer") {
    const instructions = location?.transfer_payment_instructions?.trim();
    return [
      `Listo, tu pedido ${order.id.slice(0, 8)} fue confirmado por el restaurante.`,
      instructions
        ? `Puedes hacer la transferencia con estos datos:\n${instructions}\n\nCuando la hagas, enviame el comprobante por aqui.`
        : "Puedes hacer la transferencia y enviarnos el comprobante por aqui.",
    ].join("\n\n");
  }

  return [
    `Listo, tu pedido ${order.id.slice(0, 8)} fue confirmado por el restaurante.`,
    "Ya lo estamos preparando y cualquier novedad te avisamos por aqui. Gracias por elegirnos para tu comida de hoy!",
  ].join("\n\n");
}

function buildOutOfStockMessage(itemName: string, replacementOptions: Array<{
  name: string;
  price?: number;
}>): string {
  const replacementLines = replacementOptions
    .slice(0, 3)
    .map((option, index) => `${index + 1}. ${option.name}${option.price !== undefined ? ` - ${formatCop(option.price)}` : ""}`);

  return [
    `No tenemos ${itemName} en este momento.`,
    "Te ofrecemos estas opciones de la misma categoria:",
    replacementLines.join("\n"),
    'Responde con el numero de la opcion que prefieras o escribe "cancelar".',
  ].join("\n\n");
}

function buildRetryNotificationMessage(
  type: OrderCustomerNotificationType,
  order: OrderRow,
  location?: LocationRow,
): string | null {
  if (type === "accepted") {
    return buildAcceptedOrderMessage(order, location);
  }

  if (type === "out_of_stock") {
    const metadata = order.restaurant_review_metadata ?? {};
    const unavailableItems = Array.isArray(metadata.unavailableItems) ? metadata.unavailableItems : [];
    const replacementMenuItems = Array.isArray(metadata.replacementMenuItems) ? metadata.replacementMenuItems : [];
    const unavailableName =
      unavailableItems[0] && typeof unavailableItems[0] === "object" && "name" in unavailableItems[0]
        ? String(unavailableItems[0].name)
        : null;
    const replacements: Array<{ name: string; price?: number }> = [];
    for (const item of replacementMenuItems) {
      if (!item || typeof item !== "object" || !("name" in item) || !item.name) {
        continue;
      }

      replacements.push({
        name: String(item.name),
        price: "price" in item && item.price !== undefined ? Number(item.price) : undefined,
      });
    }

    if (!unavailableName || replacements.length === 0) {
      return null;
    }

    return buildOutOfStockMessage(unavailableName, replacements);
  }

  return null;
}

async function sendOrderCustomerNotification(input: {
  env: ApiBindings;
  schemaName: string;
  context: OrderNotificationContext;
  messageText: string;
  notificationType: OrderCustomerNotificationType;
}): Promise<OrderRow> {
  const result = await sendWhatsAppTextMessage(input.env, {
    to: input.context.customer.phone,
    text: input.messageText,
  });
  const now = new Date().toISOString();
  const notificationStatus = result.providerMessageId ? "sent" : "failed";
  const [updatedOrder] = await createSupabaseRestClient(input.env).updateReturning<OrderRow>({
    schema: input.schemaName,
    table: "orders",
    query: {
      id: `eq.${input.context.order.id}`,
    },
    patch: {
      customer_notified_at: result.providerMessageId ? now : null,
      customer_notification_status: notificationStatus,
      customer_notification_error: result.providerMessageId ? null : `notification_${input.notificationType}_failed`,
      updated_at: now,
    },
  });

  if (input.context.draftOrder?.conversation_id) {
    await logOutboundTextMessage({
      env: input.env,
      schemaName: input.schemaName,
      conversationId: input.context.draftOrder.conversation_id,
      text: input.messageText,
      result,
      metadata: {
        order: {
          orderId: input.context.order.id,
          notificationType: input.notificationType,
          source: "dashboard_api",
        },
      },
    }).catch(() => undefined);
  }

  await createSupabaseRestClient(input.env).insert({
    schema: input.schemaName,
    table: "app_events",
    rows: {
      conversation_id: input.context.draftOrder?.conversation_id ?? null,
      draft_order_id: input.context.order.draft_order_id ?? null,
      order_id: input.context.order.id,
      event_name: result.providerMessageId ? "whatsapp.customer_notification_sent" : "whatsapp.customer_notification_failed",
      severity: result.providerMessageId ? "info" : "warn",
      source: "dashboard_api",
      metadata: {
        notificationType: input.notificationType,
        providerMessageId: result.providerMessageId ?? null,
      },
    },
  }).catch(() => undefined);

  return updatedOrder ?? input.context.order;
}

async function resolveReplacementOptions(input: {
  env: ApiBindings;
  schemaName: string;
  tenantTimezone?: string;
  orderItem: OrderItemRow;
  requestedReplacementMenuItemIds: string[];
}): Promise<Array<{
  menuItemId: string;
  productId?: string;
  comboId?: string;
  category?: string;
  name: string;
  price?: number;
}>> {
  const supabase = createSupabaseRestClient(input.env);
  const targetCategory = input.orderItem.category_snapshot ?? undefined;
  const activeMenuId = input.orderItem.menu_item_id
    ? await resolveMenuIdForMenuItem(supabase, input.schemaName, input.orderItem.menu_item_id)
    : await resolveActiveMenuId(supabase, input.schemaName, input.tenantTimezone);

  if (!activeMenuId) {
    return [];
  }

  const menuItems = await supabase.select<MenuItemRow>({
    schema: input.schemaName,
    table: "menu_items",
    query: {
      select: "id,menu_id,product_id,combo_id,display_name,price_override,available_quantity,is_available,sort_order",
      menu_id: `eq.${activeMenuId}`,
      is_available: "eq.true",
      order: "sort_order.asc",
      limit: 100,
    },
  });

  const candidateMenuItems = input.requestedReplacementMenuItemIds.length > 0
    ? menuItems.filter((item) => input.requestedReplacementMenuItemIds.includes(item.id))
    : menuItems;
  const productIds = candidateMenuItems
    .map((item) => item.product_id)
    .filter((value): value is string => Boolean(value));
  const productById = new Map<string, ProductRow>();

  if (productIds.length > 0) {
    const products = await supabase.select<ProductRow>({
      schema: input.schemaName,
      table: "products",
      query: {
        select: "id,name,description,base_price,category,emoji,image_url,is_active",
        id: `in.(${productIds.join(",")})`,
        is_active: "eq.true",
        limit: productIds.length,
      },
    });

    for (const product of products) {
      productById.set(product.id, product);
    }
  }

  const replacements: Array<{
    menuItemId: string;
    productId?: string;
    comboId?: string;
    category?: string;
    name: string;
    price?: number;
  }> = [];

  for (const item of candidateMenuItems) {
    if (item.id === input.orderItem.menu_item_id) {
      continue;
    }

    const product = item.product_id ? productById.get(item.product_id) : undefined;
    const category = product?.category;

    if (targetCategory && category && category !== targetCategory) {
      continue;
    }

    const name = item.display_name ?? product?.name ?? "Producto disponible";
    if (!name) {
      continue;
    }

    replacements.push({
      menuItemId: item.id,
      productId: item.product_id ?? undefined,
      comboId: item.combo_id ?? undefined,
      category,
      name,
      price: item.price_override ?? product?.base_price,
    });
  }

  return replacements.slice(0, 3);
}

async function resolveMenuIdForMenuItem(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  menuItemId: string,
): Promise<string | undefined> {
  const [menuItem] = await supabase.select<Pick<MenuItemRow, "menu_id">>({
    schema,
    table: "menu_items",
    query: {
      select: "menu_id",
      id: `eq.${menuItemId}`,
      limit: 1,
    },
  });

  return menuItem?.menu_id;
}

async function resolveActiveMenuId(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  timezone?: string,
): Promise<string | undefined> {
  const [location] = await supabase.select<LocationRow>({
    schema,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,transfer_payment_instructions,automation_enabled,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  if (!location) {
    return undefined;
  }

  const [menu] = await supabase.select<MenuRow>({
    schema,
    table: "menus",
    query: {
      select: "id,location_id,date,name,status,published_at",
      location_id: `eq.${location.id}`,
      date: `eq.${resolveBusinessDate(undefined, timezone)}`,
      status: "eq.published",
      limit: 1,
    },
  });

  return menu?.id;
}

function formatCop(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeTenantSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function buildDefaultRestaurantPassword(slug: string): string {
  const base = slug.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "restaurante";
  return `${base}_42*password`;
}

type AdminRestaurantMetrics = {
  activeProductCount: number;
  todayMenuItemCount: number;
  ordersTodayCount: number;
  pendingOrderCount: number;
  completedTodayCount: number;
  revenueToday: number;
  lastOrderAt?: string;
};

type AdminTenantSnapshot = {
  location?: LocationRow | null;
  metrics?: AdminRestaurantMetrics | null;
};

const requiredTenantOperationTables = [
  "locations",
  "products",
  "product_options",
  "product_option_values",
  "combos",
  "combo_items",
  "promotions",
  "menus",
  "menu_items",
  "customers",
  "conversations",
  "messages",
  "draft_orders",
  "draft_order_items",
  "orders",
  "order_items",
  "payment_proofs",
  "human_intervention_alerts",
  "app_events",
];

function mapAdminRestaurant(
  tenant: TenantRow,
  location?: LocationRow,
  members: ReturnType<typeof mapAdminMember>[] = [],
  metrics?: AdminRestaurantMetrics,
) {
  return {
    id: tenant.id,
    name: tenant.name ?? tenant.slug,
    slug: tenant.slug,
    schemaName: tenant.schema_name,
    status: tenant.status ?? "active",
    timezone: tenant.timezone ?? "America/Bogota",
    currency: tenant.currency ?? "COP",
    automationEnabled: tenant.automation_enabled ?? true,
    createdAt: tenant.created_at,
    updatedAt: tenant.updated_at,
    cartaUrlPath: `/carta?tenant=${tenant.slug}`,
    defaultPassword: buildDefaultRestaurantPassword(tenant.slug),
    location: location ? {
      id: location.id,
      name: location.name,
      address: location.address,
      phone: location.phone,
      deliveryFeeFixed: location.delivery_fee_fixed,
      pickupEnabled: location.pickup_enabled ?? true,
      deliveryEnabled: location.delivery_enabled ?? true,
      automationEnabled: location.automation_enabled ?? true,
      transferPaymentInstructions: location.transfer_payment_instructions ?? undefined,
      isActive: location.is_active,
    } : undefined,
    members,
    metrics: metrics ?? {
      activeProductCount: 0,
      todayMenuItemCount: 0,
      ordersTodayCount: 0,
      pendingOrderCount: 0,
      completedTodayCount: 0,
      revenueToday: 0,
    },
  };
}

function mapAdminMember(row: TenantUserRow, user?: AdminAuthUser) {
  return {
    userId: row.user_id,
    email: user?.email,
    name: user?.user_metadata?.name ?? user?.user_metadata?.username,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    lastSignInAt: user?.last_sign_in_at ?? undefined,
  };
}

async function listAdminRestaurants(env: ApiBindings) {
  const supabase = createSupabaseRestClient(env);
  const tenants = await supabase.select<TenantRow>({
    schema: "control",
    table: "tenants",
    query: {
      select: "id,name,slug,schema_name,status,timezone,currency,automation_enabled,created_at,updated_at",
      slug: "neq.thaledon",
      order: "created_at.desc",
    },
  });
  const tenantIds = tenants.map((tenant) => tenant.id);
  const tenantUsers = tenantIds.length > 0
    ? await supabase.select<TenantUserRow>({
        schema: "control",
        table: "tenant_users",
        query: {
          select: "tenant_id,user_id,role,status,created_at",
          tenant_id: `in.(${tenantIds.join(",")})`,
          order: "created_at.asc",
        },
      })
    : [];
  const uniqueUserIds = Array.from(new Set(tenantUsers.map((row) => row.user_id)));
  const authUsers = await Promise.all(uniqueUserIds.map((userId) => getAuthAdminUser(env, userId).catch(() => undefined)));
  const authUserById = new Map(authUsers.filter((user): user is AdminAuthUser => Boolean(user)).map((user) => [user.id, user]));

  const restaurants = await Promise.all(tenants.map(async (tenant) => {
    const snapshot = await getAdminTenantSnapshot(supabase, tenant);

    return mapAdminRestaurant(
      tenant,
      snapshot.location ?? undefined,
      tenantUsers
        .filter((row) => row.tenant_id === tenant.id)
        .map((row) => mapAdminMember(row, authUserById.get(row.user_id))),
      snapshot.metrics ?? undefined,
    );
  }));

  return restaurants;
}

async function getAdminTenantSnapshot(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  tenant: TenantRow,
): Promise<AdminTenantSnapshot> {
  return supabase.rpc<AdminTenantSnapshot>({
    schema: "control",
    functionName: "get_tenant_admin_snapshot",
    args: {
      p_schema_name: tenant.schema_name,
      p_timezone: tenant.timezone ?? "America/Bogota",
    },
  }).catch((error) => {
    if (isMissingTableError(error)) return {};
    throw error;
  });
}

async function getTenantById(env: ApiBindings, tenantId: string): Promise<TenantRow | undefined> {
  const [tenant] = await createSupabaseRestClient(env).select<TenantRow>({
    schema: "control",
    table: "tenants",
    query: {
      select: "id,name,slug,schema_name,status,timezone,currency,automation_enabled,created_at,updated_at",
      id: `eq.${tenantId}`,
      limit: 1,
    },
  });

  return tenant;
}

async function refreshPostgrestTenantSchemas(env: ApiBindings) {
  await createSupabaseRestClient(env).rpc<string>({
    schema: "control",
    functionName: "refresh_postgrest_tenant_schemas",
  });
}

async function verifyProvisionedRestaurant(env: ApiBindings, tenant: TenantRow, ownerUserId: string): Promise<{ ok: true } | { ok: false; failures: string[] }> {
  let lastFailures: string[] = [];

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await inspectProvisionedRestaurant(env, tenant, ownerUserId);
    if (result.ok) return result;
    lastFailures = result.failures;
    await sleep(450 * (attempt + 1));
  }

  return { ok: false, failures: lastFailures };
}

async function inspectProvisionedRestaurant(env: ApiBindings, tenant: TenantRow, ownerUserId: string): Promise<{ ok: true } | { ok: false; failures: string[] }> {
  const supabase = createSupabaseRestClient(env);
  const failures: string[] = [];

  for (const table of requiredTenantOperationTables) {
    await supabase.select({
      schema: tenant.schema_name,
      table,
      query: { select: "id", limit: 1 },
    }).catch((error) => {
      const detail = error instanceof SupabaseRestError ? `${error.status}:${error.body}` : String(error);
      failures.push(`missing_or_unreadable_table:${table}:${detail}`);
      return [];
    });
  }

  const [location] = await supabase.select<LocationRow>({
    schema: tenant.schema_name,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,pickup_enabled,delivery_enabled,automation_enabled,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  }).catch((error) => {
    const detail = error instanceof SupabaseRestError ? `${error.status}:${error.body}` : String(error);
    failures.push(`primary_location_unreadable:${detail}`);
    return [];
  });

  if (!location) {
    failures.push("primary_location_missing");
  }

  if (location) {
    const [menu] = await supabase.select<MenuRow>({
      schema: tenant.schema_name,
      table: "menus",
      query: {
        select: "id,location_id,date,name,status,published_at",
        location_id: `eq.${location.id}`,
        date: `eq.${resolveBusinessDate(undefined, tenant.timezone)}`,
        status: "eq.published",
        limit: 1,
      },
    }).catch((error) => {
      const detail = error instanceof SupabaseRestError ? `${error.status}:${error.body}` : String(error);
      failures.push(`today_menu_unreadable:${detail}`);
      return [];
    });

    if (!menu) {
      failures.push("today_published_menu_missing");
    }
  }

  const [owner] = await supabase.select<TenantUserRow>({
    schema: "control",
    table: "tenant_users",
    query: {
      select: "tenant_id,user_id,role,status,created_at",
      tenant_id: `eq.${tenant.id}`,
      user_id: `eq.${ownerUserId}`,
      role: "eq.encargado",
      status: "eq.active",
      limit: 1,
    },
  }).catch((error) => {
    const detail = error instanceof SupabaseRestError ? `${error.status}:${error.body}` : String(error);
    failures.push(`owner_membership_unreadable:${detail}`);
    return [];
  });

  if (!owner) {
    failures.push("owner_membership_missing");
  }

  return failures.length > 0 ? { ok: false, failures } : { ok: true };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updatePrimaryLocation(
  env: ApiBindings,
  schema: string,
  patch: {
    name?: string;
    address?: string;
    phone?: string;
    deliveryFeeFixed?: number;
    pickupEnabled?: boolean;
    deliveryEnabled?: boolean;
    automationEnabled?: boolean;
    transferPaymentInstructions?: string;
  },
) {
  if (Object.values(patch).every((value) => value === undefined)) return;

  await createSupabaseRestClient(env).rpc({
    schema: "control",
    functionName: "update_tenant_primary_location",
    args: {
      p_schema_name: schema,
      p_name: patch.name,
      p_address: patch.address,
      p_phone: patch.phone,
      p_delivery_fee_fixed: patch.deliveryFeeFixed,
      p_pickup_enabled: patch.pickupEnabled,
      p_delivery_enabled: patch.deliveryEnabled,
      p_automation_enabled: patch.automationEnabled,
      p_transfer_payment_instructions: patch.transferPaymentInstructions,
    },
  });
}

async function createOrLinkRestaurantMember(
  env: ApiBindings,
  tenant: TenantRow,
  input: {
    email: string;
    name: string;
    password: string;
    role: TenantUserRow["role"];
    resetPasswordIfUserExists?: boolean;
  },
) {
  const existing = await findAuthAdminUserByEmail(env, input.email);
  const user = existing ?? await createAuthAdminUser(env, {
    email: input.email,
    password: input.password,
    name: input.name,
  });

  if (existing && input.resetPasswordIfUserExists) {
    await updateAuthAdminUser(env, existing.id, { password: input.password });
  }

  await createSupabaseRestClient(env).upsert({
    schema: "control",
    table: "tenant_users",
    onConflict: "tenant_id,user_id",
    rows: {
      tenant_id: tenant.id,
      user_id: user.id,
      role: input.role,
      status: "active",
    },
  });

  return {
    member: mapAdminMember({
      tenant_id: tenant.id,
      user_id: user.id,
      role: input.role,
      status: "active",
    }, user),
  };
}

async function createAuthAdminUser(
  env: ApiBindings,
  input: {
    email: string;
    password: string;
    name: string;
  },
): Promise<AdminAuthUser> {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users`, {
    method: "POST",
    headers: buildAuthAdminHeaders(env),
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        name: input.name,
        source: "admin_console",
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new SupabaseRestError("supabase_auth_admin_create_user_failed", response.status, body);
  }

  return response.json() as Promise<AdminAuthUser>;
}

async function updateAuthAdminUser(env: ApiBindings, userId: string, patch: Record<string, unknown>): Promise<AdminAuthUser> {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: buildAuthAdminHeaders(env),
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new SupabaseRestError("supabase_auth_admin_update_user_failed", response.status, body);
  }

  return response.json() as Promise<AdminAuthUser>;
}

async function getAuthAdminUser(env: ApiBindings, userId: string): Promise<AdminAuthUser> {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users/${userId}`, {
    headers: buildAuthAdminHeaders(env),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new SupabaseRestError("supabase_auth_admin_get_user_failed", response.status, body);
  }

  return response.json() as Promise<AdminAuthUser>;
}

async function findAuthAdminUserByEmail(env: ApiBindings, email: string): Promise<AdminAuthUser | undefined> {
  const targetEmail = email.trim().toLowerCase();

  for (let page = 1; page <= 10; page += 1) {
    const url = new URL(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "100");
    const response = await fetch(url.toString(), {
      headers: buildAuthAdminHeaders(env),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SupabaseRestError("supabase_auth_admin_list_users_failed", response.status, body);
    }

    const payload = await response.json() as { users?: AdminAuthUser[] };
    const users = payload.users ?? [];
    const found = users.find((user) => user.email?.toLowerCase() === targetEmail);
    if (found) return found;
    if (users.length < 100) return undefined;
  }

  return undefined;
}

function buildAuthAdminHeaders(env: ApiBindings): HeadersInit {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function requireAuthUser(
  c: Context<{
    Bindings: ApiBindings;
    Variables: DashboardVariables;
  }>,
): Promise<AuthUser | Response> {
  const anonKey = c.env.SUPABASE_ANON_KEY;
  if (!anonKey || anonKey === "replace-me") {
    return c.json({ error: "supabase_anon_not_configured" }, 500);
  }

  const authorization = c.req.header("Authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";

  if (!token) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const response = await fetch(`${c.env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const user = (await response.json()) as AuthUser;
  return user;
}

function isSystemAdmin(user: AuthUser) {
  return user.app_metadata?.system_admin === true || user.app_metadata?.role === "system_admin";
}

async function getAuthorizedTenants(env: ApiBindings, userId: string): Promise<TenantRow[]> {
  const supabase = createSupabaseRestClient(env);
  const tenantUsers = await supabase.select<TenantUserRow>({
    schema: "control",
    table: "tenant_users",
    query: {
      select: "tenant_id,user_id,role,status",
      user_id: `eq.${userId}`,
      status: "eq.active",
    },
  });

  if (tenantUsers.length === 0) {
    return [];
  }

  const tenantIds = tenantUsers.map((row) => row.tenant_id).join(",");
  return supabase.select<TenantRow>({
    schema: "control",
    table: "tenants",
    query: {
      select: "id,name,slug,schema_name,timezone",
      id: `in.(${tenantIds})`,
      status: "eq.active",
      order: "name.asc",
    },
  });
}

async function getTenantUserRole(
  env: ApiBindings,
  userId: string,
  tenantId: string,
): Promise<TenantUserRow["role"] | undefined> {
  const [tenantUser] = await createSupabaseRestClient(env).select<TenantUserRow>({
    schema: "control",
    table: "tenant_users",
    query: {
      select: "tenant_id,user_id,role,status",
      tenant_id: `eq.${tenantId}`,
      user_id: `eq.${userId}`,
      status: "eq.active",
      limit: 1,
    },
  });

  return tenantUser?.role;
}
