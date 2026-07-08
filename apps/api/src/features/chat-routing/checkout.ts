import type {
  DraftOrder,
  MenuItem,
  TodayMenuPayload,
} from "@42day/types";
import {
  getOrCreateActiveDraftOrder,
  updateDraftOrderCoverage,
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
import {
  DeliveryCoverageConfigurationError,
  getDeliveryCoverageSettings,
  validateDeliveryCoverageFromWhatsappLocation,
} from "../delivery-coverage/service";

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

  if (signals.fulfillmentType === "delivery") {
    const settings = await getDeliveryCoverageSettings({
      env: input.env,
      schemaName: input.tenant.schemaName,
      locationId: menu.location?.id,
    });
    if (!settings?.deliveryEnabled) {
      await updateConversationState({
        env: input.env,
        schemaName: input.tenant.schemaName,
        conversationId: input.conversation.id,
        state: "awaiting_fulfillment_type",
        resetClarificationAttempts: true,
      }).catch(() => undefined);
      await sendAndLogText(input, "En este momento el restaurante no tiene domicilios activos. Puedes continuar para recoger en el local.");
      return true;
    }
  }

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
    const settings = await getDeliveryCoverageSettings({
      env: input.env,
      schemaName: input.tenant.schemaName,
      locationId: menu.location?.id,
    });
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_address",
      resetClarificationAttempts: true,
    }).catch(() => undefined);

    await sendAndLogText(input, settings?.requestLocationMessage ?? buildDeliveryAddressPrompt());
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

  const settings = await getDeliveryCoverageSettings({
    env: input.env,
    schemaName: input.tenant.schemaName,
    locationId: draft.locationId ?? menu.location?.id,
  });

  if (input.message.type !== "location") {
    const address = settings?.allowWrittenAddressReference === false
      ? null
      : await saveCustomerAddressFromText({
          env: input.env,
          schemaName: input.tenant.schemaName,
          customerId: input.conversation.customerId,
          addressText: input.message.text ?? signals.normalizedText ?? "",
        });

    if (address) {
      await updateDraftOrderCoverage({
        env: input.env,
        schemaName: input.tenant.schemaName,
        draftOrderId: draft.id,
        customerAddressText: address.addressText,
        deliveryAddressId: address.id,
        validationMethod: "written_address_reference",
        confidence: "low",
        deliveryFeeFixed: menu.location?.deliveryFeeFixed,
      });
    }

    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_address",
      resetClarificationAttempts: true,
    }).catch(() => undefined);
    await sendAndLogText(
      input,
      settings?.writtenAddressFallbackMessage ?? buildDeliveryAddressPrompt(),
    );
    return true;
  }

  const address =
    await getLatestCustomerAddress({
      env: input.env,
      schemaName: input.tenant.schemaName,
      customerId: input.conversation.customerId,
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

  let updatedDraft: DraftOrder;
  try {
    const validation = await validateDeliveryCoverageFromWhatsappLocation({
      env: input.env,
      schemaName: input.tenant.schemaName,
      locationId: draft.locationId ?? menu.location?.id,
      customerLatitude: input.message.location!.latitude,
      customerLongitude: input.message.location!.longitude,
    });
    updatedDraft = await updateDraftOrderCoverage({
      env: input.env,
      schemaName: input.tenant.schemaName,
      draftOrderId: draft.id,
      customerLatitude: input.message.location!.latitude,
      customerLongitude: input.message.location!.longitude,
      deliveryDistanceKm: validation.distanceKm,
      isInsideDeliveryCoverage: validation.isInsideCoverage,
      validationMethod: validation.validationMethod,
      confidence: validation.confidence,
      checkedAt: new Date().toISOString(),
      customerAddressText: address.addressText,
      deliveryAddressId: address.id,
      deliveryFeeFixed: menu.location?.deliveryFeeFixed,
    });

    if (!validation.isInsideCoverage && !settings?.allowOutOfCoverageOrders) {
      await updateConversationState({
        env: input.env,
        schemaName: input.tenant.schemaName,
        conversationId: input.conversation.id,
        state: "awaiting_fulfillment_type",
        resetClarificationAttempts: true,
      }).catch(() => undefined);
      await sendAndLogText(input, settings?.outOfCoverageMessage ?? "Lo sentimos, no tenemos cobertura para tu ubicacion. Puedes recoger en el local.");
      return true;
    }
  } catch (error) {
    if (!(error instanceof DeliveryCoverageConfigurationError)) throw error;
    await updateDraftOrderCoverage({
      env: input.env,
      schemaName: input.tenant.schemaName,
      draftOrderId: draft.id,
      customerLatitude: input.message.location!.latitude,
      customerLongitude: input.message.location!.longitude,
      isInsideDeliveryCoverage: null,
      validationMethod: "not_validated",
      confidence: "failed",
      checkedAt: new Date().toISOString(),
      customerAddressText: address.addressText,
      deliveryAddressId: address.id,
      deliveryFeeFixed: menu.location?.deliveryFeeFixed,
    });
    await updateConversationState({
      env: input.env,
      schemaName: input.tenant.schemaName,
      conversationId: input.conversation.id,
      state: "awaiting_fulfillment_type",
      resetClarificationAttempts: true,
    }).catch(() => undefined);
    await sendAndLogText(input, settings?.outOfCoverageMessage ?? "No pudimos validar el domicilio. Puedes recoger en el local.");
    return true;
  }

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
      buildAddressSavedPrompt(address.addressText, `Perfecto, tenemos cobertura para tu ubicacion.\n\n${buildOrderSummaryText(draftWithPayment, paymentMethod)}`),
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
    buildAddressSavedPrompt(address.addressText, `Perfecto, tenemos cobertura para tu ubicacion.\n\n${buildPaymentPrompt(updatedDraft, menu)}`),
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

  if (updatedDraft.fulfillmentType === "delivery" && updatedDraft.isInsideDeliveryCoverage !== true) {
    const settings = await getDeliveryCoverageSettings({
      env: input.env,
      schemaName: input.tenant.schemaName,
      locationId: updatedDraft.locationId ?? menu.location?.id,
    });
    if (!settings?.allowOutOfCoverageOrders) {
      await updateConversationState({
        env: input.env,
        schemaName: input.tenant.schemaName,
        conversationId: input.conversation.id,
        state: "awaiting_address",
        resetClarificationAttempts: true,
      }).catch(() => undefined);
      await sendAndLogText(input, settings?.requestLocationMessage ?? buildDeliveryAddressPrompt());
      return true;
    }
  }

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
      await sendAndLogText(input, settings?.requestLocationMessage ?? buildDeliveryAddressPrompt());
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
