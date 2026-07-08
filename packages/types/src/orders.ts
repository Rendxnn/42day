import type { ProductOptionType } from "./menu";

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
export type CoverageValidationMethod = "whatsapp_location" | "written_address_reference" | "geocoded_address" | "not_validated";
export type CoverageConfidence = "high" | "medium" | "low" | "failed";
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

export type PaymentProofStatus = "received" | "stored" | "review_pending" | "approved" | "rejected";

export type PaymentProofSummary = {
  id: string;
  status: PaymentProofStatus;
  mimeType?: string;
  fileSize?: number;
  createdAt: string;
};

export type OrderLineItemOptionTextInput = {
  groupText?: string;
  valueText: string;
  confidence?: number;
};

export type OrderLineItemSelectedOptionValue = {
  valueId?: string;
  valueCode?: string;
  valueName: string;
  priceDelta: number;
};

export type OrderLineItemResolvedOption = {
  optionId?: string;
  optionCode?: string;
  optionName: string;
  optionType: ProductOptionType;
  selectedValues?: OrderLineItemSelectedOptionValue[];
  textValue?: string;
  priceDelta: number;
};

export type OrderLineItemOptionsSnapshot = {
  mode: "resolved" | "pending_clarification";
  source: "guided" | "semantic";
  rawOptionTexts?: OrderLineItemOptionTextInput[];
  resolvedOptions?: OrderLineItemResolvedOption[];
  freeTextNotes?: string[];
  pricing?: {
    unitBasePrice: number;
    optionsPriceDelta: number;
    resolvedUnitPrice: number;
  };
  validation?: {
    status: "resolved" | "needs_clarification" | "invalid";
    missingRequiredOptionIds?: string[];
    missingRequiredOptionNames?: string[];
    invalidValueTexts?: string[];
    ambiguousValueTexts?: string[];
    reasons?: string[];
  };
  clarificationContextId?: string;
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
  options?: OrderLineItemOptionsSnapshot;
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
  customerAddressText?: string;
  customerLatitude?: number;
  customerLongitude?: number;
  deliveryDistanceKm?: number;
  isInsideDeliveryCoverage?: boolean;
  coverageValidationMethod?: CoverageValidationMethod;
  coverageConfidence?: CoverageConfidence;
  coverageCheckedAt?: string;
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
  customerAddressText?: string;
  customerLatitude?: number;
  customerLongitude?: number;
  deliveryDistanceKm?: number;
  isInsideDeliveryCoverage?: boolean;
  coverageValidationMethod?: CoverageValidationMethod;
  coverageConfidence?: CoverageConfidence;
  coverageCheckedAt?: string;
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
  customerAddressText?: string;
  customerLatitude?: number;
  customerLongitude?: number;
  deliveryDistanceKm?: number;
  isInsideDeliveryCoverage?: boolean;
  coverageValidationMethod?: CoverageValidationMethod;
  coverageConfidence?: CoverageConfidence;
  coverageCheckedAt?: string;
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
  items?: OrderLineItem[];
};

export type OrderDetail = OrderSummary & {
  locationId?: string;
  deliveryAddress?: string;
  deliveryAddressId?: string;
  items: OrderLineItem[];
  paymentProof?: PaymentProofSummary;
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
