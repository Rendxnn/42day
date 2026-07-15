import type { OrderCustomerNotificationType } from "@42day/types";
import { createSupabaseRestClient } from "../../../lib/supabase-rest";
import type { ApiBindings } from "../../../lib/bindings";
import { logOutboundImageMessage, logOutboundTextMessage } from "../../../modules/message-log/message-log";
import { sendWhatsAppImageMessage, sendWhatsAppTextMessage } from "../../../modules/whatsapp-webhook/whatsapp-client";
import type { OrderCustomerNotificationPayload } from "../order-customer-notifications";
import type { LocationRow, OrderNotificationContext, OrderRow } from "../types";
import { formatCop } from "./date";

export function buildAcceptedOrderMessage(order: OrderRow, _location?: LocationRow): string {
  if (order.payment_method === "transfer") {
    return [
      `¡Gracias! Tu pedido ${order.id.slice(0, 8)} ya fue confirmado por el restaurante. 🙌`,
      "Puedes hacer la transferencia y, cuando la realices, envíame el comprobante por aquí para continuar con tu pedido.",
    ].join("\n\n");
  }

  return [
    `¡Gracias! Tu pedido ${order.id.slice(0, 8)} ya fue confirmado por el restaurante. 🙌`,
    "Ya lo estamos preparando. Si surge alguna novedad, te escribiré por aquí.",
  ].join("\n\n");
}

export function buildOutOfStockMessage(itemName: string, replacementOptions: Array<{
  name: string;
  price?: number;
}>): string {
  const replacementLines = replacementOptions
    .slice(0, 3)
    .map((option, index) => `${index + 1}. ${option.name}${option.price !== undefined ? ` — ${formatCop(option.price)}` : ""}`);

  return [
    `Lo siento mucho, en este momento no tenemos ${itemName}.`,
    "Si quieres, puedes elegir una de estas opciones similares:",
    replacementLines.join("\n"),
    'Respóndeme con el número de la opción que prefieras o escribe "cancelar" si prefieres no continuar con ese pedido.',
  ].join("\n\n");
}

export function buildOrderStatusNotification(order: Pick<OrderRow, "status" | "fulfillment_type">): string | null {
  if (order.status === "preparing") {
    return "Tu pedido ya está siendo preparado por nuestro increíble chef. En cuanto esté listo, te avisaremos por aquí.";
  }

  if (order.status === "on_the_way") {
    return order.fulfillment_type === "delivery"
      ? "Tu pedido ya salió en camino a tu domicilio. Dentro de poco podrás disfrutarlo. ¡Gracias por la espera!"
      : "Tu pedido ya está listo para que lo recojas y lo disfrutes. ¡Te esperamos!";
  }

  if (order.status === "delivered") {
    return order.fulfillment_type === "delivery"
      ? "Tu pedido fue entregado. Esperamos que lo disfrutes. ¡Gracias por elegirnos!"
      : "Tu pedido fue finalizado. Esperamos que lo hayas disfrutado. ¡Gracias por elegirnos!";
  }

  if (order.status === "cancelled") {
    return "Tu pedido fue cancelado. Si necesitas ayuda, escríbenos por este chat.";
  }

  return null;
}

export function buildRetryNotificationMessage(
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

  if (type === "order_status") {
    return buildOrderStatusNotification(order);
  }

  return null;
}

export async function sendOrderCustomerNotification(input: {
  env: ApiBindings;
  schemaName: string;
  context: OrderNotificationContext;
  notification: OrderCustomerNotificationPayload;
  notificationType: OrderCustomerNotificationType;
}): Promise<OrderRow> {
  const result = input.notification.kind === "image"
    ? await sendWhatsAppImageMessage(input.env, {
        to: input.context.customer.phone,
        imageUrl: input.notification.imageUrl,
        caption: input.notification.caption,
      })
    : await sendWhatsAppTextMessage(input.env, {
        to: input.context.customer.phone,
        text: input.notification.text,
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
    const metadata = {
      order: {
        orderId: input.context.order.id,
        notificationType: input.notificationType,
        source: "dashboard_api",
      },
    };
    await (input.notification.kind === "image"
      ? logOutboundImageMessage({
          env: input.env,
          schemaName: input.schemaName,
          conversationId: input.context.draftOrder.conversation_id,
          caption: input.notification.caption,
          result,
          metadata: {
            ...metadata,
            imageUrl: input.notification.imageUrl,
          },
        })
      : logOutboundTextMessage({
          env: input.env,
          schemaName: input.schemaName,
          conversationId: input.context.draftOrder.conversation_id,
          text: input.notification.text,
          result,
          metadata,
        })).catch(() => undefined);
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
