import type { Order, OrderLineItem } from "@42day/types";
import type { OrderRow } from "./repository";

export function mapLineItemToOrderItem(orderId: string, item: OrderLineItem): Record<string, unknown> {
  return {
    order_id: orderId,
    menu_item_id: item.menuItemId ?? null,
    product_id: item.productId ?? null,
    combo_id: item.comboId ?? null,
    category_snapshot: item.categorySnapshot ?? null,
    name_snapshot: item.name,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    options_snapshot: item.options ?? null,
    notes: item.notes ?? null,
    line_total: item.lineTotal,
  };
}

export function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    draftOrderId: row.draft_order_id ?? undefined,
    customerId: row.customer_id,
    locationId: row.location_id ?? undefined,
    status: row.status,
    fulfillmentType: row.fulfillment_type,
    serviceTiming: row.service_timing ?? "asap",
    scheduledFor: row.scheduled_for ?? undefined,
    deliveryAddress: row.delivery_address ?? undefined,
    deliveryAddressId: row.delivery_address_id ?? undefined,
    paymentMethod: row.payment_method,
    paymentProofFileId: row.payment_proof_file_id ?? undefined,
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee,
    discountTotal: row.discount_total,
    total: row.total,
    restaurantReviewedAt: row.restaurant_reviewed_at ?? undefined,
    restaurantReviewedBy: row.restaurant_reviewed_by ?? undefined,
    restaurantConfirmedAt: row.restaurant_confirmed_at ?? undefined,
    restaurantConfirmedBy: row.restaurant_confirmed_by ?? undefined,
    restaurantReviewNote: row.restaurant_review_note ?? undefined,
    restaurantReviewMetadata: row.restaurant_review_metadata ?? undefined,
    customerNotifiedAt: row.customer_notified_at ?? undefined,
    customerNotificationStatus: row.customer_notification_status ?? undefined,
    customerNotificationError: row.customer_notification_error ?? undefined,
    paymentConfirmedAt: row.payment_confirmed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
