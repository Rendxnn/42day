import { getLatestCustomerOrderStatus } from "../orders/customer-status";
import { buildCustomerOrderStatusMessage } from "../../modules/message-router/response-composer";
import { sendAndLogText } from "./outbound/send";
import type { RouteInboundMessageInput } from "./shared/types";

export async function handleCustomerOrderStatus(input: RouteInboundMessageInput): Promise<void> {
  const order = await getLatestCustomerOrderStatus({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    currentDraftOrderId: input.conversation.currentDraftOrderId,
  });

  await sendAndLogText(
    input,
    order
      ? buildCustomerOrderStatusMessage(order)
      : "Aún no encuentro un pedido confirmado en este chat. Si quieres, puedo ayudarte a iniciar uno o revisar tu pedido actual.",
  );
}
