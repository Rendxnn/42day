export const draftOrderStatuses = [
  "draft",
  "needs_clarification",
  "ready_for_confirmation",
  "confirmed",
  "cancelled",
  "expired",
] as const;

export const orderStatuses = [
  "new",
  "payment_pending_review",
  "accepted",
  "preparing",
  "on_the_way",
  "delivered",
  "cancelled",
] as const;

export type DraftOrderStatus = (typeof draftOrderStatuses)[number];
export type OrderStatus = (typeof orderStatuses)[number];
export type FulfillmentType = "delivery" | "pickup";
export type PaymentMethod = "cash" | "transfer";

export type OrderLineItem = {
  productId?: string;
  comboId?: string;
  menuItemId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  options?: Record<string, unknown>;
  notes?: string;
  lineTotal: number;
};

export type DraftOrder = {
  id: string;
  status: DraftOrderStatus;
  fulfillmentType?: FulfillmentType;
  deliveryAddress?: string;
  paymentMethod?: PaymentMethod;
  items: OrderLineItem[];
  subtotal: number;
  deliveryFee: number;
  discountTotal: number;
  total: number;
  validationErrors?: string[];
  expiresAt?: string;
};
