import type { DraftOrder } from "@42day/types";
import { getOrCreateActiveDraftOrder, updateDraftOrderBilling, updateDraftOrderCoverage, updateDraftOrderPaymentMethod } from "../../draft-orders/service";
import { getLatestCustomerAddress, saveCustomerAddressFromText } from "../../../modules/customer-address-service/customer-address-service";
import { updateConversationState } from "../../conversations/service";
import { buildAddressSaveFailedPrompt, buildAddressSavedPrompt } from "../../../modules/message-router/response-composer";
import { loadCurrentMenu } from "../shared/helpers";
import { sendAndLogText } from "../outbound/send";
import type { RouteInboundMessageInput } from "../shared/types";
import {
  DeliveryCoverageConfigurationError,
  getDeliveryCoverageSettings,
  validateDeliveryCoverageFromWrittenAddress,
  validateDeliveryCoverageFromWhatsappLocation,
} from "../../delivery-coverage/service";
import { startBillingStep } from "./billing";
import { buildAddressValidationRetryPrompt, buildWrittenAddressHelpPrompt } from "./address-prompts";

export async function tryHandleDeliveryAddress(input: RouteInboundMessageInput, signals: {
  looksLikeAddress?: boolean;
  cannotShareLocation?: boolean;
  normalizedText?: string;
  addressText?: string;
  paymentMethod?: "cash" | "transfer" | null;
}): Promise<boolean> {
  if (input.message.type !== "location" && !signals.looksLikeAddress && !signals.cannotShareLocation) {
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
    if (signals.cannotShareLocation) {
      await updateConversationState({
        env: input.env,
        schemaName: input.tenant.schemaName,
        conversationId: input.conversation.id,
        state: "awaiting_address",
        resetClarificationAttempts: true,
      }).catch(() => undefined);
      await sendAndLogText(input, buildWrittenAddressHelpPrompt());
      return true;
    }

    const writtenAddressText = (input.message.text ?? signals.normalizedText ?? "").trim();
    const address = writtenAddressText.length === 0 || settings?.allowWrittenAddressReference === false
      ? null
      : await saveCustomerAddressFromText({
          env: input.env,
          schemaName: input.tenant.schemaName,
          customerId: input.conversation.customerId,
          addressText: signals.addressText?.trim() || writtenAddressText,
        });

    if (writtenAddressText) {
      await updateDraftOrderCoverage({
        env: input.env,
        schemaName: input.tenant.schemaName,
        draftOrderId: draft.id,
        customerAddressText: address?.addressText ?? writtenAddressText,
        deliveryAddressId: address?.id,
        validationMethod: "written_address_reference",
        confidence: "low",
        deliveryFeeFixed: menu.location?.deliveryFeeFixed,
      });
    }

    let writtenAddressValidation = null;
    if (writtenAddressText) {
      try {
        writtenAddressValidation = await validateDeliveryCoverageFromWrittenAddress({
          env: input.env,
          schemaName: input.tenant.schemaName,
          locationId: draft.locationId ?? menu.location?.id,
          addressText: writtenAddressText,
        });
      } catch (error) {
        // A geocoding outage must not block checkout when the restaurant has
        // enabled written addresses as a delivery reference.
        console.warn("delivery_coverage.written_address_geocoding_failed", {
          conversationId: input.conversation.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (writtenAddressValidation) {
      const validatedDraft = await updateDraftOrderCoverage({
        env: input.env,
        schemaName: input.tenant.schemaName,
        draftOrderId: draft.id,
        customerLatitude: writtenAddressValidation.latitude,
        customerLongitude: writtenAddressValidation.longitude,
        deliveryDistanceKm: writtenAddressValidation.distanceKm,
        isInsideDeliveryCoverage: writtenAddressValidation.isInsideCoverage,
        validationMethod: writtenAddressValidation.validationMethod,
        confidence: writtenAddressValidation.confidence,
        checkedAt: new Date().toISOString(),
        customerAddressText: address?.addressText ?? writtenAddressValidation.formattedAddress,
        deliveryAddressId: address?.id,
        deliveryFeeFixed: menu.location?.deliveryFeeFixed,
      });

      if (!writtenAddressValidation.isInsideCoverage && !settings?.allowOutOfCoverageOrders) {
        await updateConversationState({
          env: input.env,
          schemaName: input.tenant.schemaName,
          conversationId: input.conversation.id,
          state: "awaiting_fulfillment_type",
          resetClarificationAttempts: true,
        }).catch(() => undefined);
        await sendAndLogText(input, settings?.outOfCoverageMessage ?? "Lo sentimos, no tenemos cobertura para esa direccion. Puedes recoger en el local.");
        return true;
      }

      const draftWithPayment = signals.paymentMethod
        ? await updateDraftOrderPaymentMethod({
            env: input.env,
            schemaName: input.tenant.schemaName,
            draftOrderId: validatedDraft.id,
            paymentMethod: signals.paymentMethod,
            deliveryFeeFixed: menu.location?.deliveryFeeFixed,
          })
        : validatedDraft;

      await startBillingStep(input, {
        menu,
        draft: draftWithPayment,
        prefix: buildAddressSavedPrompt(
          writtenAddressValidation.formattedAddress,
          writtenAddressValidation.isInsideCoverage
            ? "Perfecto, validamos tu direccion y esta dentro de cobertura."
            : "Perfecto, validamos tu direccion. Continuemos con el pedido.",
        ),
      });
      return true;
    }

    // A written address is still useful when Google is unavailable or cannot
    // resolve the exact rooftop. Keep it as the delivery reference instead of
    // trapping the customer in an address/location loop. Coverage can be
    // reviewed by the restaurant when the order is received.
    if (writtenAddressText && settings?.allowWrittenAddressReference !== false) {
      const referenceDraft = await updateDraftOrderCoverage({
        env: input.env,
        schemaName: input.tenant.schemaName,
        draftOrderId: draft.id,
        customerAddressText: address?.addressText ?? writtenAddressText,
        deliveryAddressId: address?.id,
        validationMethod: "written_address_reference",
        confidence: "low",
        deliveryFeeFixed: menu.location?.deliveryFeeFixed,
      });

      const draftWithPayment = signals.paymentMethod
        ? await updateDraftOrderPaymentMethod({
            env: input.env,
            schemaName: input.tenant.schemaName,
            draftOrderId: referenceDraft.id,
            paymentMethod: signals.paymentMethod,
            deliveryFeeFixed: menu.location?.deliveryFeeFixed,
          })
        : referenceDraft;

      await startBillingStep(input, {
        menu,
        draft: draftWithPayment,
        prefix: buildAddressSavedPrompt(
          address?.addressText ?? writtenAddressText,
          "Guardamos esta dirección como referencia. El restaurante verificará la cobertura al revisar el pedido.",
        ),
      });
      return true;
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
      buildAddressValidationRetryPrompt(),
    );
    return true;
  }

  const address =
    await getLatestCustomerAddress({
      env: input.env,
      schemaName: input.tenant.schemaName,
      customerId: input.conversation.customerId,
    });

  const resolvedAddressText = address?.addressText ?? draft.customerAddressText ?? draft.deliveryAddress;

  if (!resolvedAddressText) {
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
      customerAddressText: resolvedAddressText,
      deliveryAddressId: address?.id,
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
      customerAddressText: resolvedAddressText,
      deliveryAddressId: address?.id,
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
    prefix: buildAddressSavedPrompt(resolvedAddressText, "Perfecto, tenemos cobertura para tu ubicacion."),
  });
  return true;
}
