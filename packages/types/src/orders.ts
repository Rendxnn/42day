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
  "pending_restaurant_confirmation",
  "needs_customer_replacement",
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
export type ServiceTiming = "asap" | "scheduled";
export type OrdersBucket = "pending_confirmation" | "active" | "history" | "all";
export type CustomerNotificationStatus = "pending" | "sent" | "failed";
export type OrderCustomerNotificationType = "accepted" | "out_of_stock";

export type OutOfStockReplacementOption = {
  menuItemId: string;
  productId?: string;
  comboId?: string;
  category?: string;
  name: string;
  price?: number;
};

export type RestaurantReviewMetadata = {
  reason?: "out_of_stock";
  unavailableOrderItemIds?: string[];
  unavailableItems?: Array<{
    orderItemId: string;
    menuItemId?: string;
    productId?: string;
    comboId?: string;
    name: string;
    quantity: number;
    category?: string;
  }>;
  replacementMenuItems?: OutOfStockReplacementOption[];
  markMenuItemsUnavailable?: boolean;
};

export type AcceptOrderRequest = {
  note?: string;
};

export type RejectOutOfStockOrderRequest = {
  items: Array<{
    orderItemId: string;
    markMenuItemUnavailable?: boolean;
    replacementMenuItemIds?: string[];
  }>;
  note?: string;
};

export type RetryOrderCustomerNotificationRequest = {
  type: OrderCustomerNotificationType;
};

export type OrderLineItem = {
  id?: string;
  productId?: string;
  comboId?: string;
  menuItemId?: string;
  categorySnapshot?: string;
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
  locationId?: string;
  fulfillmentType?: FulfillmentType;
  serviceTiming?: ServiceTiming;
  scheduledFor?: string;
  deliveryAddress?: string;
  deliveryAddressId?: string;
  paymentMethod?: PaymentMethod;
  items: OrderLineItem[];
  subtotal: number;
  deliveryFee: number;
  discountTotal: number;
  total: number;
  validationErrors?: string[];
  expiresAt?: string;
};

export type Order = {
  id: string;
  draftOrderId?: string;
  customerId: string;
  locationId?: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  serviceTiming: ServiceTiming;
  scheduledFor?: string;
  deliveryAddress?: string;
  deliveryAddressId?: string;
  paymentMethod: PaymentMethod;
  paymentProofFileId?: string;
  subtotal: number;
  deliveryFee: number;
  discountTotal: number;
  total: number;
  restaurantReviewedAt?: string;
  restaurantReviewedBy?: string;
  restaurantConfirmedAt?: string;
  restaurantConfirmedBy?: string;
  restaurantReviewNote?: string;
  restaurantReviewMetadata?: RestaurantReviewMetadata;
  customerNotifiedAt?: string;
  customerNotificationStatus?: CustomerNotificationStatus;
  customerNotificationError?: string;
  paymentConfirmedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type OrderSummary = {
  id: string;
  draftOrderId?: string;
  customerId: string;
  customerPhone?: string;
  customerName?: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  serviceTiming: ServiceTiming;
  scheduledFor?: string;
  paymentMethod: PaymentMethod;
  subtotal: number;
  deliveryFee: number;
  discountTotal: number;
  total: number;
  restaurantReviewedAt?: string;
  restaurantReviewedBy?: string;
  restaurantConfirmedAt?: string;
  restaurantConfirmedBy?: string;
  restaurantReviewNote?: string;
  restaurantReviewMetadata?: RestaurantReviewMetadata;
  customerNotifiedAt?: string;
  customerNotificationStatus?: CustomerNotificationStatus;
  customerNotificationError?: string;
  paymentConfirmedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type OrderDetail = OrderSummary & {
  locationId?: string;
  deliveryAddress?: string;
  deliveryAddressId?: string;
  items: OrderLineItem[];
};

export type OrdersDashboardPayload = {
  bucket: OrdersBucket;
  counts: {
    pendingConfirmation: number;
    active: number;
    history: number;
    transferPendingReview: number;
    openAlerts: number;
  };
  orders: OrderSummary[];
};
