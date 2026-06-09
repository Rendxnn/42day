import type {
  DraftOrder,
  MenuItem,
  TodayMenuPayload,
} from "@42day/types";
import {
  getOrCreateActiveDraftOrder,
  updateDraftOrderDeliveryAddress,
  updateDraftOrderFulfillment,
  updateDraftOrderPaymentMethod,
} from "../draft-orders/service";
import { getLatestCustomerAddress, saveCustomerAddressFromText } from "../../modules/customer-address-service/customer-address-service";
import { updateConversationState } from "../conversations/service";
import {
  buildAddressSaveFailedPrompt,
  buildAddressSavedPrompt,
  buildAddMorePrompt,
  buildCurrentDraftText,
  buildDeliveryAddressPrompt,
  buildEditableSummaryAdjustmentPrompt,
  buildEmptyDraftPrompt,
  buildFulfillmentPrompt,
  buildOrderSummaryText,
  buildOrderSubmittedForReviewMessage,
  buildPaymentPrompt,
  buildPickupPaymentPrompt,
} from "../../modules/message-router/response-composer";
import { buildGuidedContext, loadCurrentMenu } from "./helpers";
import { sendAndLogText } from "./outbound";
import type { RouteInboundMessageInput } from "./types";
import { persistConfirmedOrder } from "../orders/service";

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
  let draft = payload.draft;

  if (payload.signals.fulfillmentType) {
    draft = await updateDraftOrderFulfillment({
      env: input.env,
      schemaName: input.tenant.schemaName,
      draftOrderId: draft.id,
      fulfillmentType: payload.signals.fulfillmentType,
      deliveryFeeFixed: payload.menu.location?.deliveryFeeFixed,
    });
  }

  if (payload.signals.paymentMethod) {
    draft = await updateDraftOrderPaymentMethod({
      env: input.env,
      schemaName: input.tenant.schemaName,
      draftOrderId: draft.id,
      paymentMethod: payload.signals.paymentMethod,
      deliveryFeeFixed: payload.menu.location?.deliveryFeeFixed,
    });
  }

  return draft;
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

  if (draft.fulfillmentType === "delivery" && !draft.deliveryAddress && !draft.deliveryAddressId) {
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_address",
      context: payload?.context,
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(input, buildDeliveryAddressPrompt());
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

export async function tryHandleFulfillmentSelection(input: RouteInboundMessageInput, signals: {
  fulfillmentType?: "delivery" | "pickup" | null;
  paymentMethod?: "cash" | "transfer" | null;
}): Promise<boolean> {
  if (!signals.fulfillmentType) {
    return false;
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

  let updatedDraft = await updateDraftOrderFulfillment({
    env: input.env,
    schemaName: input.tenant.schemaName,
    draftOrderId: draft.id,
    fulfillmentType: signals.fulfillmentType,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  });

  if (signals.paymentMethod) {
    updatedDraft = await updateDraftOrderPaymentMethod({
      env: input.env,
      schemaName: input.tenant.schemaName,
      draftOrderId: updatedDraft.id,
      paymentMethod: signals.paymentMethod,
      deliveryFeeFixed: menu.location?.deliveryFeeFixed,
    });
  }

  if (signals.fulfillmentType === "delivery") {
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_address",
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(input, buildDeliveryAddressPrompt());
    return true;
  }

  if (signals.paymentMethod) {
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_confirmation",
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(input, buildOrderSummaryText(updatedDraft, signals.paymentMethod));
    return true;
  }

  await updateConversationState({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    state: "awaiting_payment_method",
    resetClarificationAttempts: true,
  }).catch(() => undefined);

  await sendAndLogText(input, buildPickupPaymentPrompt(menu, updatedDraft));
  return true;
}

export async function tryHandleDeliveryAddress(input: RouteInboundMessageInput, signals: {
  looksLikeAddress?: boolean;
  normalizedText?: string;
  paymentMethod?: "cash" | "transfer" | null;
}): Promise<boolean> {
  if (input.message.type !== "location" && !signals.looksLikeAddress) {
    return false;
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

  const address =
    input.message.type === "location"
      ? await getLatestCustomerAddress({
          env: input.env,
          schemaName: input.tenant.schemaName,
          customerId: input.conversation.customerId,
        })
      : await saveCustomerAddressFromText({
          env: input.env,
          schemaName: input.tenant.schemaName,
          customerId: input.conversation.customerId,
          addressText: input.message.text ?? signals.normalizedText ?? "",
        });

  if (!address) {
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_address",
      resetClarificationAttempts: true,
    }).catch(() => undefined);
    await sendAndLogText(input, buildAddressSaveFailedPrompt());
    return true;
  }

  const updatedDraft = await updateDraftOrderDeliveryAddress({
    env: input.env,
    schemaName: input.tenant.schemaName,
    draftOrderId: draft.id,
    addressText: address.addressText,
    deliveryAddressId: address.id,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  });

  const paymentMethod = updatedDraft.paymentMethod ?? signals.paymentMethod;

  if (paymentMethod) {
    const draftWithPayment = updatedDraft.paymentMethod
      ? updatedDraft
      : await updateDraftOrderPaymentMethod({
          env: input.env,
          schemaName: input.tenant.schemaName,
          draftOrderId: updatedDraft.id,
          paymentMethod,
          deliveryFeeFixed: menu.location?.deliveryFeeFixed,
        });

    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_confirmation",
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(
      input,
      buildAddressSavedPrompt(address.addressText, buildOrderSummaryText(draftWithPayment, paymentMethod)),
    );
    return true;
  }

  await updateConversationState({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    state: "awaiting_payment_method",
    resetClarificationAttempts: true,
  }).catch(() => undefined);

  await sendAndLogText(
    input,
    buildAddressSavedPrompt(address.addressText, buildPaymentPrompt(updatedDraft, menu)),
  );
  return true;
}

export async function tryHandlePaymentMethod(input: RouteInboundMessageInput, signals: {
  paymentMethod?: "cash" | "transfer" | null;
}): Promise<boolean> {
  if (!signals.paymentMethod) {
    return false;
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

  const updatedDraft = await updateDraftOrderPaymentMethod({
    env: input.env,
    schemaName: input.tenant.schemaName,
    draftOrderId: draft.id,
    paymentMethod: signals.paymentMethod,
    deliveryFeeFixed: menu.location?.deliveryFeeFixed,
  });

  await updateConversationState({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    state: "awaiting_confirmation",
    resetClarificationAttempts: true,
  }).catch(() => undefined);

  await sendAndLogText(input, buildOrderSummaryText(updatedDraft, signals.paymentMethod));
  return true;
}

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
