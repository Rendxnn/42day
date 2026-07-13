import type { DraftOrder } from "@42day/types";
import { getOrCreateActiveDraftOrder, updateDraftOrderBilling, updateDraftOrderCoverage, updateDraftOrderPaymentMethod } from "../../draft-orders/service";
import { getLatestCustomerAddress, saveCustomerAddressFromText } from "../../../modules/customer-address-service/customer-address-service";
import { updateConversationState } from "../../conversations/service";
import { buildAddressSaveFailedPrompt, buildAddressSavedPrompt, buildDeliveryAddressPrompt } from "../../../modules/message-router/response-composer";
import { loadCurrentMenu } from "../shared/helpers";
import { sendAndLogText } from "../outbound/send";
import type { RouteInboundMessageInput } from "../shared/types";
import {
  DeliveryCoverageConfigurationError,
  getDeliveryCoverageSettings,
  validateDeliveryCoverageFromWhatsappLocation,
} from "../../delivery-coverage/service";
import { startBillingStep } from "./billing";

export async function tryHandleDeliveryAddress(input: RouteInboundMessageInput, signals: {
  looksLikeAddress?: boolean;
  normalizedText?: string;
  addressText?: string;
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
          addressText: signals.addressText ?? input.message.text ?? signals.normalizedText ?? "",
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
    updatedDraft = await updateDraftOrderCoverage({
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

  const draftWithPayment = signals.paymentMethod
    ? await updateDraftOrderPaymentMethod({
        env: input.env,
        schemaName: input.tenant.schemaName,
        draftOrderId: updatedDraft.id,
        paymentMethod: signals.paymentMethod,
        deliveryFeeFixed: menu.location?.deliveryFeeFixed,
      })
    : updatedDraft;

  await startBillingStep(input, {
    menu,
    draft: draftWithPayment,
    prefix: buildAddressSavedPrompt(address.addressText, "Perfecto, tenemos cobertura para tu ubicacion."),
  });
  return true;
}
