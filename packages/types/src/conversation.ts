export const conversationStates = [
  "new",
  "awaiting_mode_selection",
  "awaiting_guided_item_selection",
  "awaiting_product_configuration",
  "awaiting_more_items",
  "awaiting_fulfillment_type",
  "awaiting_address",
  "awaiting_billing_reuse_confirmation",
  "awaiting_normal_billing_info",
  "awaiting_electronic_billing_info",
  "awaiting_payment_method",
  "awaiting_transfer_proof",
  "awaiting_transfer_fallback_payment_method",
  "awaiting_confirmation",
  "awaiting_restaurant_confirmation",
  "awaiting_replacement_selection",
  "manual",
  "completed",
  "expired",
] as const;

export type ConversationState = (typeof conversationStates)[number];
export type ConversationContext = Record<string, unknown>;

export type Conversation = {
  id: string;
  customerId: string;
  channel: "whatsapp";
  state: ConversationState;
  context: ConversationContext;
  clarificationAttempts: number;
  currentDraftOrderId?: string;
  manualReason?: string;
  lastInboundAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};
