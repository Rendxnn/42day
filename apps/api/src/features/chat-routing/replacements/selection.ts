import { completeConversationAfterOrderCancellation, incrementClarificationAttempts, updateConversationState } from "../../conversations/service";
import {
  applyCustomerReplacementSelection,
  cancelPendingCustomerReplacementOrder,
  getPendingCustomerReplacementOrder,
} from "../../orders/service";
import {
  buildReplacementAppliedMessage,
  buildReplacementCancelledMessage,
  buildReplacementOptionUnavailableMessage,
  buildReplacementOrderNotFoundMessage,
  buildReplacementSelectionPrompt,
  buildReplacementUnresolvedMessage,
  buildReplacementUpdateFailedMessage,
} from "../../../modules/message-router/response-composer";
import { resolveReplacementOptionSelection } from "../shared/helpers";
import { moveToManual } from "../manual/handoff";
import { sendAndLogText } from "../outbound/send";
import type { RouteInboundMessageInput } from "../shared/types";
import type { DetectedSignals } from "../../../modules/message-router/signal-detector";

export async function tryHandleReplacementSelection(
  input: RouteInboundMessageInput,
  signals: DetectedSignals,
  payload?: {
    selectionText?: string | null;
  },
): Promise<boolean> {
  const pendingReplacement = await getPendingCustomerReplacementOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    currentDraftOrderId: input.conversation.currentDraftOrderId,
  });

  if (!pendingReplacement) {
    await moveToManual(input, {
      type: "technical_error",
      manualReason: "replacement_order_not_found",
      title: "No se encontro el pedido para reemplazo",
      description: "La conversacion estaba esperando reemplazo, pero no se encontro una orden en ese estado.",
      responseText: buildReplacementOrderNotFoundMessage(),
    });
    return true;
  }

  if (signals.confirmation === "no") {
    await cancelPendingCustomerReplacementOrder({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      currentDraftOrderId: input.conversation.currentDraftOrderId,
    });

    await completeConversationAfterOrderCancellation({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
    }).catch(() => undefined);

    await sendAndLogText(input, buildReplacementCancelledMessage());
    return true;
  }

  const selectedReplacement = resolveReplacementOptionSelection({
    normalizedText: payload?.selectionText ?? signals.normalizedText,
    numericSelection: null,
    replacementOptions: pendingReplacement.replacementOptions,
  });

  if (!selectedReplacement) {
    return false;
  }

  try {
    const result = await applyCustomerReplacementSelection({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      currentDraftOrderId: input.conversation.currentDraftOrderId,
      selectedReplacementMenuItemId: selectedReplacement.menuItemId,
    });

    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_restaurant_confirmation",
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(
      input,
      buildReplacementAppliedMessage(result.unavailableItemName, result.selectedReplacement.name),
    );
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const replacementBecameUnavailable =
      reason === "order.customer_replacement_menu_item_unavailable" ||
      reason === "order.customer_replacement_product_inactive";

    await moveToManual(input, {
      type: replacementBecameUnavailable ? "order_change_requested" : "technical_error",
      manualReason: replacementBecameUnavailable ? "replacement_option_no_longer_available" : "replacement_selection_failed",
      title: replacementBecameUnavailable
        ? "Reemplazo ya no disponible"
        : "No fue posible aplicar el reemplazo",
      description: replacementBecameUnavailable
        ? "La opcion elegida por el cliente ya no estaba disponible al procesar la respuesta."
        : "El sistema no pudo actualizar la orden despues de la seleccion del cliente.",
      responseText: replacementBecameUnavailable
        ? buildReplacementOptionUnavailableMessage()
        : buildReplacementUpdateFailedMessage(),
    });
    return true;
  }
}

export async function handleReplacementSelectionClarification(input: RouteInboundMessageInput): Promise<void> {
  const pendingReplacement = await getPendingCustomerReplacementOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    currentDraftOrderId: input.conversation.currentDraftOrderId,
  });

  if (!pendingReplacement) {
    await moveToManual(input, {
      type: "technical_error",
      manualReason: "replacement_order_not_found",
      title: "No se encontro el pedido para reemplazo",
      description: "La conversacion estaba esperando reemplazo, pero no se encontro una orden en ese estado.",
      responseText: buildReplacementOrderNotFoundMessage(),
    });
    return;
  }

  if (input.conversation.clarificationAttempts >= 2) {
    await moveToManual(input, {
      type: "order_change_requested",
      manualReason: "replacement_selection_unresolved",
      title: "Cliente no eligio reemplazo claro",
      description: "El cliente no eligio un reemplazo interpretable despues de varios intentos.",
      responseText: buildReplacementUnresolvedMessage(),
    });
    return;
  }

  await incrementClarificationAttempts({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
  }).catch(() => undefined);

  await sendAndLogText(input, buildReplacementSelectionPrompt(pendingReplacement.replacementOptions));
}
