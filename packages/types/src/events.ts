export const eventSeverities = ["debug", "info", "warn", "error", "critical"] as const;

export type EventSeverity = (typeof eventSeverities)[number];

export type AppEvent = {
  id?: string;
  conversationId?: string;
  draftOrderId?: string;
  orderId?: string;
  eventName: string;
  severity: EventSeverity;
  source: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export type HumanInterventionType =
  | "order_pending_confirmation"
  | "support_requested"
  | "transfer_payment_review"
  | "parser_failed"
  | "validation_failed_repeatedly"
  | "technical_error"
  | "order_change_requested"
  | "automation_disabled";

export const humanInterventionStatuses = ["open", "acknowledged", "resolved"] as const;

export type HumanInterventionStatus = (typeof humanInterventionStatuses)[number];

export type HumanInterventionAlert = {
  id: string;
  conversationId?: string;
  draftOrderId?: string;
  orderId?: string;
  type: HumanInterventionType;
  status: HumanInterventionStatus;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string;
};
