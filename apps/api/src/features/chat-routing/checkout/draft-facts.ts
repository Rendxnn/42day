import type { DraftOrder, OrderBillingDetails, TodayMenuPayload } from "@42day/types";
import { saveCustomerAddressFromText } from "../../../modules/customer-address-service/customer-address-service";
import { saveCustomerBillingProfile } from "../../../modules/customer-billing-service/customer-billing-service";
import { getDeliveryCoverageSettings } from "../../delivery-coverage/service";
import {
  updateDraftOrderBilling,
  updateDraftOrderCoverage,
  updateDraftOrderFulfillment,
  updateDraftOrderPaymentMethod,
} from "../../draft-orders/service";
import { applyBillingDefaults } from "./billing-helpers";
import type { RouteInboundMessageInput } from "../shared/types";

export type DraftFacts = {
  fulfillmentType?: "delivery" | "pickup" | null;
  paymentMethod?: "cash" | "transfer" | null;
  deliveryAddressText?: string | null;
  billing?: OrderBillingDetails | null;
};

export async function applyDraftFacts(input: RouteInboundMessageInput, payload: {
  menu: TodayMenuPayload;
  draft: DraftOrder;
  facts: DraftFacts;
}): Promise<DraftOrder> {
  let draft = payload.draft;
  const deliveryFeeFixed = payload.menu.location?.deliveryFeeFixed;

  if (payload.facts.fulfillmentType) {
    draft = await updateDraftOrderFulfillment({
      env: input.env,
      schemaName: input.tenant.schemaName,
      draftOrderId: draft.id,
      fulfillmentType: payload.facts.fulfillmentType,
      deliveryFeeFixed,
    });
  }

  if (payload.facts.deliveryAddressText?.trim() && draft.fulfillmentType === "delivery") {
    const settings = await getDeliveryCoverageSettings({
      env: input.env,
      schemaName: input.tenant.schemaName,
      locationId: draft.locationId ?? payload.menu.location?.id,
    });
    if (settings?.allowWrittenAddressReference !== false) {
      const address = await saveCustomerAddressFromText({
        env: input.env,
        schemaName: input.tenant.schemaName,
        customerId: input.conversation.customerId,
        addressText: payload.facts.deliveryAddressText,
      });
      draft = await updateDraftOrderCoverage({
        env: input.env,
        schemaName: input.tenant.schemaName,
        draftOrderId: draft.id,
        customerAddressText: address.addressText,
        deliveryAddressId: address.id,
        validationMethod: "written_address_reference",
        confidence: "low",
        deliveryFeeFixed,
      });
    }
  }

  if (payload.facts.billing) {
    const billing = applyBillingDefaults(payload.facts.billing, draft);
    const profile = await saveCustomerBillingProfile({
      env: input.env,
      schemaName: input.tenant.schemaName,
      customerId: input.conversation.customerId,
      billing,
    });
    draft = await updateDraftOrderBilling({
      env: input.env,
      schemaName: input.tenant.schemaName,
      draftOrderId: draft.id,
      billing: { ...billing, profileId: profile.id },
      deliveryFeeFixed,
    });
  }

  if (payload.facts.paymentMethod) {
    draft = await updateDraftOrderPaymentMethod({
      env: input.env,
      schemaName: input.tenant.schemaName,
      draftOrderId: draft.id,
      paymentMethod: payload.facts.paymentMethod,
      deliveryFeeFixed,
    });
  }

  return draft;
}
