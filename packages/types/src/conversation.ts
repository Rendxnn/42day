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
  "awaiting_order_adjustment",
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
  automationEnabled: boolean;
  automationResumeState?: ConversationState;
  automationChangedAt?: string;
  automationChangedBy?: string;
  automationChangeReason?: string;
  lastInboundAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationAutomation = {
  conversationId: string;
  enabled: boolean;
  effectiveEnabled: boolean;
  state: ConversationState;
  resumeState?: ConversationState;
  manualReason?: string;
  changedAt?: string;
  changedBy?: string;
  changeReason?: string;
  updatedAt: string;
  terminal: boolean;
};
