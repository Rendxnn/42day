import { calculateDraftTotals, validateDraftForConfirmation } from "@42day/core";
import type { DraftOrder, OrderLineItem } from "@42day/types";
import type { DraftOrderItemRow, DraftOrderRow } from "./repository";

export function createEmptyDraftOrder(input: {
  id: string;
  locationId?: string;
  items?: OrderLineItem[];
  fulfillmentType?: DraftOrder["fulfillmentType"];
  serviceTiming?: DraftOrder["serviceTiming"];
  deliveryAddress?: string;
  deliveryAddressId?: string;
  paymentMethod?: DraftOrder["paymentMethod"];
  deliveryFeeFixed?: number;
}): DraftOrder {
  const totals = calculateDraftTotals({
    items: input.items ?? [],
    fulfillmentType: input.fulfillmentType,
    deliveryFeeFixed: input.deliveryFeeFixed ?? 0,
  });

  return {
    id: input.id,
    status: "draft",
    locationId: input.locationId,
    fulfillmentType: input.fulfillmentType,
    serviceTiming: input.serviceTiming ?? "asap",
    deliveryAddress: input.deliveryAddress,
    deliveryAddressId: input.deliveryAddressId,
    paymentMethod: input.paymentMethod,
    items: input.items ?? [],
    ...totals,
  };
}

export function markDraftReadyIfValid(draft: DraftOrder): DraftOrder {
  const validation = validateDraftForConfirmation(draft);

  return {
    ...draft,
    status: validation.ok ? "ready_for_confirmation" : "needs_clarification",
    validationErrors: validation.errors,
  };
}

export function mapDraftOrder(row: DraftOrderRow, items: OrderLineItem[]): DraftOrder {
  return {
    id: row.id,
    status: row.status,
    locationId: row.location_id ?? undefined,
    fulfillmentType: row.fulfillment_type ?? undefined,
    serviceTiming: row.service_timing ?? "asap",
    scheduledFor: row.scheduled_for ?? undefined,
    deliveryAddress: row.delivery_address ?? undefined,
    deliveryAddressId: row.delivery_address_id ?? undefined,
    customerAddressText: row.customer_address_text ?? undefined,
    customerLatitude: row.customer_latitude ?? undefined,
    customerLongitude: row.customer_longitude ?? undefined,
    deliveryDistanceKm: row.delivery_distance_km ?? undefined,
    isInsideDeliveryCoverage: row.is_inside_delivery_coverage ?? undefined,
    coverageValidationMethod: row.coverage_validation_method ?? undefined,
    coverageConfidence: row.coverage_confidence ?? undefined,
    coverageCheckedAt: row.coverage_checked_at ?? undefined,
    paymentMethod: row.payment_method ?? undefined,
    billing: row.billing_type
      ? {
          type: row.billing_type,
          profileId: row.billing_profile_id ?? undefined,
          fullName: row.billing_full_name ?? undefined,
          billingAddress: row.billing_address ?? undefined,
          legalName: row.billing_legal_name ?? undefined,
          taxId: row.billing_tax_id ?? undefined,
          email: row.billing_email ?? undefined,
        }
      : undefined,
    items,
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee,
    discountTotal: row.discount_total,
    total: row.total,
    validationErrors: row.validation_errors ?? undefined,
    expiresAt: row.expires_at ?? undefined,
  };
}

export function mapLineItem(row: DraftOrderItemRow): OrderLineItem {
  return {
    menuItemId: row.menu_item_id ?? undefined,
    productId: row.product_id ?? undefined,
    comboId: row.combo_id ?? undefined,
    name: row.name_snapshot,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    options: row.options_snapshot ?? undefined,
    notes: row.notes ?? undefined,
    lineTotal: row.line_total,
  };
}
