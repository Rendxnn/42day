import type { Conversation, NormalizedInboundMessage, Tenant } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import type { SemanticParserResult } from "../../modules/semantic-parser/semantic-parser";

export type ResponseRoutingTrace = {
  responseSource?: "deterministic" | "llm" | "deterministic_after_llm_fallback";
  responseReason?: string;
  llm?: {
    attempted: boolean;
    used: boolean;
    outcome: "handled" | "skipped_or_failed" | "low_confidence" | "unresolved" | "not_order";
    provider?: "gemini";
    reason?: string;
    intent?: SemanticParserResult["intent"];
    confidence?: number;
    itemCount?: number;
    editActionCount?: number;
  };
};

export type RouteInboundMessageInput = {
  env: ApiBindings;
  tenant: Tenant;
  conversation: Conversation;
  message: NormalizedInboundMessage;
  routingTrace?: ResponseRoutingTrace;
};
