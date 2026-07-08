import { Hono } from "hono";
import type { ApiBindings } from "../../../lib/bindings";
import { sendWhatsAppTextMessage } from "../../../modules/whatsapp-webhook/whatsapp-client";
import { logOutboundTextMessage } from "../../../modules/message-log/message-log";
import { createSupabaseRestClient } from "../../../lib/supabase-rest";
import { getTenantUserRole } from "../auth";
import type { CustomerRow, DashboardVariables, DraftOrderRow, MenuItemRow, MenuRow, OrderRow, ProductRow } from "../types";
import { formatCop, resolveBusinessDate } from "../router";

type LunchReminderRecipient = {
  customer: CustomerRow;
  order: Pick<OrderRow, "id" | "draft_order_id" | "customer_id" | "created_at">;
  conversationId?: string;
};

type LunchReminderMenuItem = {
  name: string;
  price?: number;
};

const LOOKBACK_DAYS = 3;

export const lunchRemindersDashboardRoutes = new Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>();

lunchRemindersDashboardRoutes.get("/:tenantSlug/lunch-reminders/preview", async (c) => {
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
    lookbackDays: LOOKBACK_DAYS,
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

lunchRemindersDashboardRoutes.post("/:tenantSlug/lunch-reminders/send", async (c) => {
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
          campaign: {
            type: "lunch_reminder",
            batchId,
          },
        },
      }).catch(() => undefined);
    }
  }

  return c.json({
    batchId,
    lookbackDays: LOOKBACK_DAYS,
    recipientCount: recipients.length,
    sentCount: results.filter((result) => result.status === "sent").length,
    failedCount: results.filter((result) => result.status === "failed").length,
    menuItemCount: menuItems.length,
    results,
  });
});

async function resolveLunchReminderRecipients(env: ApiBindings, schemaName: string): Promise<LunchReminderRecipient[]> {
  const lookbackSince = new Date();
  lookbackSince.setDate(lookbackSince.getDate() - LOOKBACK_DAYS);

  const orders = await createSupabaseRestClient(env).select<Pick<OrderRow, "id" | "draft_order_id" | "customer_id" | "created_at">>({
    schema: schemaName,
    table: "orders",
    query: {
      select: "id,draft_order_id,customer_id,created_at",
      created_at: `gte.${lookbackSince.toISOString()}`,
      status: "neq.cancelled",
      order: "created_at.desc",
      limit: 500,
    },
  });

  const customers = await createSupabaseRestClient(env).select<CustomerRow>({
    schema: schemaName,
    table: "customers",
    query: {
      select: "id,phone,name",
      limit: 500,
    },
  });

  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const draftOrderIds = Array.from(new Set(orders.map((order) => order.draft_order_id).filter((id): id is string => Boolean(id))));
  const draftOrders = draftOrderIds.length > 0
    ? await createSupabaseRestClient(env).select<DraftOrderRow>({
        schema: schemaName,
        table: "draft_orders",
        query: {
          select: "id,conversation_id",
          id: `in.(${draftOrderIds.join(",")})`,
          limit: draftOrderIds.length,
        },
      }).catch(() => [])
    : [];
  const conversationByDraftOrderId = new Map(draftOrders.map((draftOrder) => [draftOrder.id, draftOrder.conversation_id ?? undefined]));
  const recipientsByPhone = new Map<string, LunchReminderRecipient>();

  for (const order of orders) {
    const customer = customerById.get(order.customer_id);
    if (!customer?.phone) continue;
    const phoneKey = customer.phone.replace(/\D/g, "");
    if (!phoneKey || recipientsByPhone.has(phoneKey)) continue;
    recipientsByPhone.set(phoneKey, {
      customer,
      order,
      conversationId: order.draft_order_id ? conversationByDraftOrderId.get(order.draft_order_id) : undefined,
    });
  }

  return Array.from(recipientsByPhone.values());
}

async function resolveLunchReminderMenuItems(env: ApiBindings, schemaName: string, timezone?: string): Promise<LunchReminderMenuItem[]> {
  const businessDate = resolveBusinessDate(undefined, timezone);
  const [menu] = await createSupabaseRestClient(env).select<MenuRow>({
    schema: schemaName,
    table: "menus",
    query: {
      select: "id,location_id,date,name,status,published_at",
      date: `eq.${businessDate}`,
      status: "eq.published",
      order: "published_at.desc",
      limit: 1,
    },
  });

  if (!menu) {
    return [];
  }

  const [menuItems, products] = await Promise.all([
    createSupabaseRestClient(env).select<MenuItemRow>({
      schema: schemaName,
      table: "menu_items",
      query: {
        select: "id,menu_id,product_id,combo_id,display_name,price_override,available_quantity,is_available,sort_order",
        menu_id: `eq.${menu.id}`,
        is_available: "eq.true",
        order: "sort_order.asc",
        limit: 40,
      },
    }),
    createSupabaseRestClient(env).select<ProductRow>({
      schema: schemaName,
      table: "products",
      query: {
        select: "id,name,description,base_price,category,emoji,product_type,image_url,is_active",
        is_active: "eq.true",
        limit: 100,
      },
    }),
  ]);

  const productById = new Map(products.map((product) => [product.id, product]));

  const reminderItems: LunchReminderMenuItem[] = [];

  for (const menuItem of menuItems) {
    const product = menuItem.product_id ? productById.get(menuItem.product_id) : undefined;
    const name = menuItem.display_name ?? product?.name;
    if (!name) continue;

    reminderItems.push({
      name,
      price: menuItem.price_override ?? product?.base_price,
    });
  }

  return reminderItems.slice(0, 8);
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
