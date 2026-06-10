import type { Conversation, DraftOrder, NormalizedInboundMessage, Tenant } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import type { SemanticParserResult } from "../../modules/semantic-parser/semantic-parser";

export type LlmProviderId = "gemini" | "openrouter" | "openai" | "anthropic" | "custom";
export type LlmErrorClass =
  | "transient_capacity"
  | "quota_exceeded"
  | "timeout"
  | "schema_invalid"
  | "provider_auth"
  | "unknown_provider_failure";

export type DraftSummaryTrace = {
  itemCount: number;
  subtotal: number;
  total: number;
  fulfillmentType?: DraftOrder["fulfillmentType"];
  paymentMethod?: DraftOrder["paymentMethod"];
};

export type StateDeltaTrace = {
  applied: boolean;
  reasonCode: string;
  source: "fast_path" | "semantic" | "guided" | "deterministic" | "system";
  itemName?: string | null;
  quantity?: number | null;
  subtotal?: number | null;
};

export type LlmAttemptTrace = {
  provider: LlmProviderId;
  model: string;
  attempt: number;
  route: "primary" | "fallback";
  status: "requested" | "succeeded" | "failed";
  latencyMs?: number;
  reasonCode?: string;
  errorClass?: LlmErrorClass;
  preview?: string;
  outputHash?: string;
  parsedItemCount?: number;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
};

export type ResponseRoutingTrace = {
  traceId?: string;
  turnId?: string;
  stateVersion?: number;
  responseSource?: "deterministic" | "llm" | "deterministic_after_llm_fallback";
  responseReason?: string;
  pendingUserUtterance?: string | null;
  blockFurtherRouting?: boolean;
  llm?: {
    attempted: boolean;
    used: boolean;
    outcome: "handled" | "skipped_or_failed" | "low_confidence" | "unresolved" | "not_order";
    provider?: LlmProviderId;
    model?: string;
    reason?: string;
    errorClass?: LlmErrorClass;
    intent?: SemanticParserResult["intent"];
    confidence?: number;
    itemCount?: number;
    editActionCount?: number;
    attemptCount?: number;
    providerChain?: string[];
    attempts?: LlmAttemptTrace[];
  };
  state?: {
    deltaApplied?: boolean;
    reasonCode?: string;
    source?: StateDeltaTrace["source"];
    before?: DraftSummaryTrace;
    after?: DraftSummaryTrace;
    deltas?: StateDeltaTrace[];
  };
};

export type RouteInboundMessageInput = {
  env: ApiBindings;
  tenant: Tenant;
  conversation: Conversation;
  message: NormalizedInboundMessage;
  loggedMessageId?: string;
  routingTrace?: ResponseRoutingTrace;
};
