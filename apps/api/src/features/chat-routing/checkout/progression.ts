import type { DraftOrder, MenuItem, TodayMenuPayload } from "@42day/types";
import { getOrCreateActiveDraftOrder } from "../../draft-orders/service";
import { updateConversationState } from "../../conversations/service";
import {
  buildAddMorePrompt,
  buildCurrentDraftText,
  buildDeliveryAddressPrompt,
  buildEmptyDraftPrompt,
  buildFulfillmentPrompt,
  buildOrderSummaryText,
  buildPaymentPrompt,
} from "../../../modules/message-router/response-composer";
import { buildGuidedContext, loadCurrentMenu } from "../shared/helpers";
import { sendAndLogText } from "../outbound/send";
import type { RouteInboundMessageInput } from "../shared/types";
import { getDeliveryCoverageSettings } from "../../delivery-coverage/service";
import { startBillingStep } from "./billing";
import { applyDraftFacts } from "./draft-facts";

type CheckoutSignals = {
  fulfillmentType?: "delivery" | "pickup" | null;
  paymentMethod?: "cash" | "transfer" | null;
};

export async function continueAfterItemAdded(input: RouteInboundMessageInput, payload: {
  menu: TodayMenuPayload;
  draft: DraftOrder;
  selectedItem: MenuItem;
  quantity: number;
  signals: CheckoutSignals;
}): Promise<void> {
  const draft = await applyKnownSignalsToDraft(input, {
    menu: payload.menu,
    draft: payload.draft,
    signals: payload.signals,
  });

  if (payload.signals.fulfillmentType || payload.signals.paymentMethod || input.conversation.state === "awaiting_confirmation") {
    await proceedToNextOrderStep(input, {
      menu: payload.menu,
      draft,
      context: buildGuidedContext(payload.menu, payload.selectedItem),
    });
    return;
  }

  await updateConversationState({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    state: "awaiting_more_items",
    context: buildGuidedContext(payload.menu, payload.selectedItem),
    resetClarificationAttempts: true,
  }).catch(() => undefined);

  await sendAndLogText(input, buildAddMorePrompt(draft));
}

export async function applyKnownSignalsToDraft(input: RouteInboundMessageInput, payload: {
  menu: TodayMenuPayload;
  draft: DraftOrder;
  signals: CheckoutSignals;
}): Promise<DraftOrder> {
  return applyDraftFacts(input, {
    menu: payload.menu,
    draft: payload.draft,
    facts: {
      fulfillmentType: payload.signals.fulfillmentType,
      paymentMethod: payload.signals.paymentMethod,
    },
  });
}

export async function proceedToNextOrderStep(input: RouteInboundMessageInput, payload?: {
  menu?: TodayMenuPayload;
  draft?: DraftOrder;
  context?: Record<string, unknown>;
}): Promise<void> {
  const menu = payload?.menu ?? (await loadCurrentMenu(input));
  const draft = payload?.draft ?? (await getOrCreateActiveDraftOrder({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversation: input.conversation,
    customerId: input.conversation.customerId,
    locationId: menu.location?.id,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  }));

  if (draft.items.length === 0) {
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_guided_item_selection",
      context: payload?.context,
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(input, buildEmptyDraftPrompt());
    return;
  }

  if (!draft.fulfillmentType) {
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_fulfillment_type",
      context: payload?.context,
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(input, [buildCurrentDraftText(draft), buildFulfillmentPrompt(menu)].join("\n\n"));
    return;
  }

  if (
    draft.fulfillmentType === "delivery"
    && (draft.coverageValidationMethod !== "whatsapp_location" || draft.isInsideDeliveryCoverage !== true)
  ) {
    const settings = await getDeliveryCoverageSettings({
      env: input.env,
      schemaName: input.tenant.schemaName,
      locationId: draft.locationId,
    });
    if (!settings?.allowOutOfCoverageOrders) {
      await updateConversationState({
        env: input.env,
        schemaName: input.tenant.schemaName,
        conversationId: input.conversation.id,
        state: "awaiting_address",
        context: payload?.context,
        resetClarificationAttempts: true,
      }).catch(() => undefined);

      await sendAndLogText(input, settings?.requestLocationMessage ?? buildDeliveryAddressPrompt());
      return;
    }
  }

  if (!draft.billing?.type) {
    await startBillingStep(input, { menu, draft, context: payload?.context });
    return;
  }

  if (!draft.paymentMethod) {
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_payment_method",
      context: payload?.context,
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(input, buildPaymentPrompt(draft, menu));
    return;
  }

  await updateConversationState({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    state: "awaiting_confirmation",
    context: payload?.context,
    resetClarificationAttempts: true,
  }).catch(() => undefined);

  await sendAndLogText(input, buildOrderSummaryText(draft, draft.paymentMethod));
}
