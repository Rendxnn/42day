export const conversationStates = [
  "new",
  "awaiting_mode_selection",
  "awaiting_guided_item_selection",
  "awaiting_fulfillment_type",
  "awaiting_address",
  "awaiting_payment_method",
  "awaiting_transfer_proof",
  "awaiting_confirmation",
  "manual",
  "completed",
  "expired",
] as const;

export type ConversationState = (typeof conversationStates)[number];

export type Conversation = {
  id: string;
  customerId: string;
  channel: "whatsapp";
  state: ConversationState;
  currentDraftOrderId?: string;
  manualReason?: string;
  lastInboundAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};
