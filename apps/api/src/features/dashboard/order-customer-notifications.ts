import type { ConversationState } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { loadTransferConfigurationForLocation, mapPaymentQrResponse } from "./payment-configuration";
import type { OrderRow, TenantRow } from "./types";

export type OrderCustomerNotificationPayload =
  | {
    kind: "text";
    text: string;
  }
  | {
    kind: "image";
    imageUrl: string;
    caption: string;
  };

export async function buildAcceptedOrderNotification(input: {
  env: ApiBindings;
  tenant: Pick<TenantRow, "schema_name">;
  order: OrderRow;
}): Promise<{
  conversationState: ConversationState;
  notification: OrderCustomerNotificationPayload;
}> {
  if (input.order.payment_method !== "transfer") {
    return {
      conversationState: "completed",
      notification: {
        kind: "text",
        text: buildCashAcceptedOrderMessage(input.order),
      },
    };
  }

  if (!input.order.location_id) {
    return {
      conversationState: "awaiting_transfer_fallback_payment_method",
      notification: {
        kind: "text",
        text: buildTransferUnavailableMessage(input.order),
      },
    };
  }

  const transferConfiguration = await loadTransferConfigurationForLocation(
    input.env,
    input.tenant.schema_name,
    input.order.location_id,
  );
  const accountLines = transferConfiguration.accounts.map((account) => (
    `• ${account.bank_name}: ${account.account_number} - ${account.holder_name}`
  ));

  if (transferConfiguration.activeQr) {
    const qr = mapPaymentQrResponse(input.env, transferConfiguration.activeQr);
    return {
      conversationState: "awaiting_transfer_proof",
      notification: {
        kind: "image",
        imageUrl: qr.imageUrl,
        caption: buildTransferAcceptedCaption(input.order, {
          accountLines,
          includeQrInstruction: true,
        }),
      },
    };
  }

  if (accountLines.length > 0) {
    return {
      conversationState: "awaiting_transfer_proof",
      notification: {
        kind: "text",
        text: buildTransferAcceptedCaption(input.order, {
          accountLines,
          includeQrInstruction: false,
        }),
      },
    };
  }

  return {
    conversationState: "awaiting_transfer_fallback_payment_method",
    notification: {
      kind: "text",
      text: buildTransferUnavailableMessage(input.order),
    },
  };
}

export function buildCashAcceptedOrderMessage(order: Pick<OrderRow, "id">): string {
  return [
    `Listo 🙌 Tu pedido ${order.id.slice(0, 8)} ya fue confirmado por el restaurante.`,
    "Ya lo estamos preparando y, si surge alguna novedad, te escribiré por aquí.",
  ].join("\n\n");
}

export function buildTransferUnavailableMessage(order: Pick<OrderRow, "id">): string {
  return [
    `Listo 🙌 Tu pedido ${order.id.slice(0, 8)} ya fue confirmado por el restaurante.`,
    "En este momento no tenemos un medio de pago por transferencia activo para compartirte.",
    "Si te queda bien, podemos manejar el pago en efectivo. ¿Te funciona así?",
  ].join("\n\n");
}

export function buildTransferStillUnavailableMessage(): string {
  return [
    "Ahora mismo no tengo un medio de transferencia activo para compartirte.",
    "Si te parece bien, podemos continuar con pago en efectivo. ¿Te funciona así?",
  ].join("\n\n");
}

export function buildTransferFallbackCashConfirmedMessage(): string {
  return [
    "Perfecto 🙌 Entonces dejamos el pago en efectivo.",
    "El restaurante ya puede seguir con tu pedido y, si surge alguna novedad, te escribiré por aquí.",
  ].join("\n\n");
}

function buildTransferAcceptedCaption(
  order: Pick<OrderRow, "id">,
  input: {
    accountLines: string[];
    includeQrInstruction: boolean;
  },
): string {
  return [
    `Listo 🙌 Tu pedido ${order.id.slice(0, 8)} ya fue confirmado por el restaurante.`,
    input.includeQrInstruction
      ? "Te comparto el QR activo para que puedas hacer la transferencia."
      : "Te comparto los datos disponibles para que puedas hacer la transferencia.",
    input.accountLines.length > 0 ? `Cuentas disponibles:\n${input.accountLines.join("\n")}` : "",
    "Cuando realices el pago, envíame el comprobante por este mismo chat y con gusto seguimos.",
  ].filter(Boolean).join("\n\n");
}
