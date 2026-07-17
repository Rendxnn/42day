import type { SemanticParserResult } from "../../../modules/semantic-parser/semantic-parser";
import type { ResponseRoutingTrace, RouteInboundMessageInput } from "./types";

export function logRoutingDiagnostic(input: RouteInboundMessageInput, event: string, payload: Record<string, unknown> = {}): void {
  console.info(JSON.stringify({
    event,
    tenantId: input.tenant.id,
    conversationId: input.conversation.id,
    inboundProviderMessageId: input.message.providerMessageId ?? null,
    conversationState: input.conversation.state,
    messageType: input.message.type,
    ...payload,
  }));
}

export function markLlmAttempt(input: RouteInboundMessageInput): void {
  input.routingTrace = {
    ...(input.routingTrace ?? {}),
    llm: {
      attempted: true,
      used: false,
      outcome: "skipped_or_failed",
      provider: "gemini",
    },
  };
}

export function markLlmOutcome(input: RouteInboundMessageInput, payload: {
  used: boolean;
  outcome: NonNullable<ResponseRoutingTrace["llm"]>["outcome"];
  provider?: "gemini" | "openrouter";
  reason?: string;
  parsed?: SemanticParserResult;
}): void {
  input.routingTrace = {
    ...(input.routingTrace ?? {}),
    responseSource: payload.used ? "llm" : "deterministic_after_llm_fallback",
    responseReason: payload.reason,
    llm: {
      attempted: true,
      used: payload.used,
      outcome: payload.outcome,
      provider: payload.provider ?? "gemini",
      reason: payload.reason,
      intent: payload.parsed?.intent,
      confidence: payload.parsed?.confidence,
      itemCount: payload.parsed?.items.length,
      editActionCount: payload.parsed?.editActions?.length,
      parsed: payload.parsed ? redactSemanticParserResult(payload.parsed) : undefined,
    },
  };
}

export function redactSemanticParserResult(parsed: SemanticParserResult): SemanticParserResult {
  return {
    ...parsed,
    addressText: parsed.addressText ? "[redacted]" : parsed.addressText,
    draftFacts: parsed.draftFacts
      ? {
          ...parsed.draftFacts,
          deliveryAddressText: parsed.draftFacts.deliveryAddressText ? "[redacted]" : parsed.draftFacts.deliveryAddressText,
          billing: parsed.draftFacts.billing
            ? {
                type: parsed.draftFacts.billing.type,
                confidence: parsed.draftFacts.billing.confidence,
              }
            : parsed.draftFacts.billing,
        }
      : undefined,
  };
}

export function buildOutboundRoutingMetadata(input: RouteInboundMessageInput): Record<string, unknown> {
  const trace = input.routingTrace ?? {
    responseSource: "deterministic",
    responseReason: "default",
  };
  const responseSource =
    trace.responseSource ??
    (trace.llm?.attempted && !trace.llm.used ? "deterministic_after_llm_fallback" : "deterministic");

  return {
    routing: {
      responseSource,
      responseReason: trace.responseReason ?? null,
      decidedAt: new Date().toISOString(),
      conversationState: input.conversation.state,
      inboundProviderMessageId: input.message.providerMessageId ?? null,
      llm: trace.llm ?? {
        attempted: false,
        used: false,
      },
    },
  };
}
