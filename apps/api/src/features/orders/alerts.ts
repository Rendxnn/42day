import type { HumanInterventionType } from "@42day/types";

export function buildPendingAlert(input: {
  conversationId: string;
  draftOrderId?: string;
  orderId: string;
  description?: string;
}): Record<string, unknown> {
  return buildAlertRow({
    conversationId: input.conversationId,
    draftOrderId: input.draftOrderId,
    orderId: input.orderId,
    type: "order_pending_confirmation",
    title: "Pedido pendiente por confirmar",
    description: input.description ?? "El cliente ya confirmo el pedido y el restaurante debe revisarlo.",
  });
}

export function buildAlertRow(input: {
  conversationId: string;
  draftOrderId?: string;
  orderId: string;
  type: HumanInterventionType;
  title: string;
  description: string;
}): Record<string, unknown> {
  return {
    conversation_id: input.conversationId,
    draft_order_id: input.draftOrderId ?? null,
    order_id: input.orderId,
    type: input.type,
    title: input.title,
    description: input.description,
    status: "open",
  };
}

