import { getOrCreateActiveDraftOrder } from "../../draft-orders/service";
import { updateConversationState } from "../../conversations/service";
import {
  buildDeliveryAddressPrompt,
  buildEditableSummaryAdjustmentPrompt,
  buildOrderSubmittedForReviewMessage,
} from "../../../modules/message-router/response-composer";
import { loadCurrentMenu } from "../shared/helpers";
import { sendAndLogText } from "../outbound/send";
import type { RouteInboundMessageInput } from "../shared/types";
import { persistConfirmedOrder } from "../../orders/service";
import { getDeliveryCoverageSettings } from "../../delivery-coverage/service";
import { buildCoverageRequestMessage } from "./address-prompts";

export async function tryHandleConfirmation(input: RouteInboundMessageInput, signals: {
  confirmation?: "yes" | "no" | "change" | null;
}): Promise<boolean> {
  if (!signals.confirmation) {
    return false;
  }

  if (signals.confirmation === "no" || signals.confirmation === "change") {
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_more_items",
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(
      input,
      buildEditableSummaryAdjustmentPrompt(),
    );
    return true;
  }

  const menu = await loadCurrentMenu(input);
  const draft = await getOrCreateActiveDraftOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversation: input.conversation,
    customerId: input.conversation.customerId,
    locationId: menu.location?.id,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  });

  if (draft.fulfillmentType === "delivery" && draft.isInsideDeliveryCoverage !== true) {
    const settings = await getDeliveryCoverageSettings({
      env: input.env,
      schemaName: input.tenant.schemaName,
      locationId: draft.locationId ?? menu.location?.id,
    });
    if (!settings?.allowOutOfCoverageOrders) {
      await updateConversationState({
        env: input.env,
        schemaName: input.tenant.schemaName,
        conversationId: input.conversation.id,
        state: "awaiting_address",
        resetClarificationAttempts: true,
      }).catch(() => undefined);
      await sendAndLogText(input, buildCoverageRequestMessage({
        requestLocationMessage: settings?.requestLocationMessage ?? buildDeliveryAddressPrompt(),
        tryGeocodeWrittenAddresses: settings?.tryGeocodeWrittenAddresses,
      }));
      return true;
    }
  }

  const order = await persistConfirmedOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    customerId: input.conversation.customerId,
    draft,
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
    buildOrderSubmittedForReviewMessage(order.id, draft.paymentMethod),
  );
  return true;
}
