import type { DraftOrder } from "@42day/types";
import type { SemanticParserResult } from "../../modules/semantic-parser/semantic-parser";
import { updateConversationContext } from "../conversations/service";
import type {
  DraftSummaryTrace,
  LlmAttemptTrace,
  LlmErrorClass,
  LlmProviderId,
  ResponseRoutingTrace,
  RouteInboundMessageInput,
  StateDeltaTrace,
} from "./types";

const APP_EVENT_LABEL = "app_event";

export function initializeRoutingTrace(input: RouteInboundMessageInput): void {
  const traceId = input.routingTrace?.traceId ?? input.message.providerMessageId ?? crypto.randomUUID();
  const turnId = input.routingTrace?.turnId ?? input.loggedMessageId ?? input.message.providerMessageId ?? crypto.randomUUID();

  input.routingTrace = {
    ...(input.routingTrace ?? {}),
    traceId,
    turnId,
    stateVersion: nextStateVersion(input.routingTrace),
    responseSource: input.routingTrace?.responseSource ?? "deterministic",
    responseReason: input.routingTrace?.responseReason ?? "route_started",
    llm: {
      attempted: input.routingTrace?.llm?.attempted ?? false,
      used: input.routingTrace?.llm?.used ?? false,
      outcome: input.routingTrace?.llm?.outcome ?? "skipped_or_failed",
      ...(input.routingTrace?.llm ?? {}),
    },
    state: input.routingTrace?.state,
  };
}

export function traceInfo(
  input: RouteInboundMessageInput,
  eventName: string,
  payload: TraceEventPayload = {},
): void {
  emitTrace("info", input, eventName, payload);
}

export function traceWarn(
  input: RouteInboundMessageInput,
  eventName: string,
  payload: TraceEventPayload = {},
): void {
  emitTrace("warn", input, eventName, payload);
}

export function traceError(
  input: RouteInboundMessageInput,
  eventName: string,
  payload: TraceEventPayload = {},
): void {
  emitTrace("error", input, eventName, payload);
}

export function traceRaw(
  input: RouteInboundMessageInput,
  eventName: string,
  payload: Record<string, unknown>,
): void {
  initializeRoutingTrace(input);
  console.info("app_event_raw", {
    eventName,
    traceId: input.routingTrace?.traceId,
    conversationId: input.conversation.id,
    turnId: input.routingTrace?.turnId,
    tenant: input.tenant.slug,
    payload,
  });
}

export function markLlmAttempt(input: RouteInboundMessageInput, payload: {
  provider: LlmProviderId;
  model: string;
  attempt: number;
  route: "primary" | "fallback";
  inputPreview?: string;
  estimatedInputTokens?: number;
}): void {
  const attempts = upsertAttempt(input.routingTrace?.llm?.attempts, {
    provider: payload.provider,
    model: payload.model,
    attempt: payload.attempt,
    route: payload.route,
    status: "requested",
    inputTokens: payload.estimatedInputTokens,
  });

  input.routingTrace = {
    ...(input.routingTrace ?? {}),
    responseSource: "deterministic_after_llm_fallback",
    responseReason: "llm_attempt_started",
    llm: {
      attempted: true,
      used: false,
      outcome: "skipped_or_failed",
      provider: payload.provider,
      model: payload.model,
      attemptCount: attempts.length,
      providerChain: uniqueProviderChain(attempts),
      attempts,
    },
  };

  traceInfo(input, "llm.request", {
    provider: payload.provider,
    model: payload.model,
    attempt: payload.attempt,
    route: payload.route,
    reasonCode: "semantic_order_parse",
    inputTokens: payload.estimatedInputTokens,
    preview: payload.inputPreview,
  });
}

export function markLlmAttemptSuccess(input: RouteInboundMessageInput, payload: {
  provider: LlmProviderId;
  model: string;
  attempt: number;
  route: "primary" | "fallback";
  latencyMs?: number;
  parsed: SemanticParserResult;
  preview?: string;
  outputHash?: string;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
}): void {
  const attempts = upsertAttempt(input.routingTrace?.llm?.attempts, {
    provider: payload.provider,
    model: payload.model,
    attempt: payload.attempt,
    route: payload.route,
    status: "succeeded",
    latencyMs: payload.latencyMs,
    preview: payload.preview,
    outputHash: payload.outputHash,
    parsedItemCount: payload.parsed.items.length,
    finishReason: payload.finishReason,
    inputTokens: payload.inputTokens,
    outputTokens: payload.outputTokens,
  });

  input.routingTrace = {
    ...(input.routingTrace ?? {}),
    llm: {
      attempted: true,
      used: true,
      outcome: "handled",
      provider: payload.provider,
      model: payload.model,
      intent: payload.parsed.intent,
      confidence: payload.parsed.confidence,
      itemCount: payload.parsed.items.length,
      editActionCount: payload.parsed.editActions?.length,
      attemptCount: attempts.length,
      providerChain: uniqueProviderChain(attempts),
      attempts,
    },
  };

  traceInfo(input, "llm.response", {
    provider: payload.provider,
    model: payload.model,
    attempt: payload.attempt,
    route: payload.route,
    latencyMs: payload.latencyMs,
    inputTokens: payload.inputTokens,
    outputTokens: payload.outputTokens,
    preview: payload.preview,
    outputHash: payload.outputHash,
    finishReason: payload.finishReason,
    parsedItemCount: payload.parsed.items.length,
    reasonCode: payload.parsed.intent,
  });
}

export function markLlmAttemptFailure(input: RouteInboundMessageInput, payload: {
  provider: LlmProviderId;
  model: string;
  attempt: number;
  route: "primary" | "fallback";
  latencyMs?: number;
  errorClass: LlmErrorClass;
  reasonCode: string;
  message: string;
}): void {
  const attempts = upsertAttempt(input.routingTrace?.llm?.attempts, {
    provider: payload.provider,
    model: payload.model,
    attempt: payload.attempt,
    route: payload.route,
    status: "failed",
    latencyMs: payload.latencyMs,
    reasonCode: payload.reasonCode,
    errorClass: payload.errorClass,
  });

  input.routingTrace = {
    ...(input.routingTrace ?? {}),
    responseSource: "deterministic_after_llm_fallback",
    responseReason: payload.message,
    llm: {
      attempted: true,
      used: false,
      outcome: "skipped_or_failed",
      provider: payload.provider,
      model: payload.model,
      reason: payload.message,
      errorClass: payload.errorClass,
      attemptCount: attempts.length,
      providerChain: uniqueProviderChain(attempts),
      attempts,
    },
  };

  traceWarn(input, "llm.error", {
    provider: payload.provider,
    model: payload.model,
    attempt: payload.attempt,
    route: payload.route,
    latencyMs: payload.latencyMs,
    reasonCode: payload.reasonCode,
    errorClass: payload.errorClass,
    preview: payload.message,
  });
}

export function markLlmOutcome(input: RouteInboundMessageInput, payload: {
  used: boolean;
  outcome: NonNullable<ResponseRoutingTrace["llm"]>["outcome"];
  reason?: string;
  errorClass?: LlmErrorClass;
  parsed?: SemanticParserResult;
  responseSource?: ResponseRoutingTrace["responseSource"];
}): void {
  const currentLlm = input.routingTrace?.llm;

  input.routingTrace = {
    ...(input.routingTrace ?? {}),
    responseSource: payload.responseSource ?? (payload.used ? "llm" : "deterministic_after_llm_fallback"),
    responseReason: payload.reason,
    llm: {
      attempted: currentLlm?.attempted ?? true,
      used: payload.used,
      outcome: payload.outcome,
      provider: currentLlm?.provider,
      model: currentLlm?.model,
      reason: payload.reason,
      errorClass: payload.errorClass ?? currentLlm?.errorClass,
      intent: payload.parsed?.intent ?? currentLlm?.intent,
      confidence: payload.parsed?.confidence ?? currentLlm?.confidence,
      itemCount: payload.parsed?.items.length ?? currentLlm?.itemCount,
      editActionCount: payload.parsed?.editActions?.length ?? currentLlm?.editActionCount,
      attemptCount: currentLlm?.attemptCount ?? currentLlm?.attempts?.length ?? 0,
      providerChain: currentLlm?.providerChain,
      attempts: currentLlm?.attempts,
    },
    state: input.routingTrace?.state,
  };

  traceInfo(input, "llm.outcome", {
    provider: currentLlm?.provider,
    model: currentLlm?.model,
    reasonCode: payload.reason ?? payload.outcome,
    errorClass: payload.errorClass ?? currentLlm?.errorClass,
    preview: payload.parsed ? formatParsedSummary(payload.parsed) : payload.reason,
  });
}

export function recordStateBefore(input: RouteInboundMessageInput, draft: DraftOrder, payload?: {
  source?: StateDeltaTrace["source"];
  reasonCode?: string;
}): void {
  const summary = summarizeDraft(draft);
  input.routingTrace = {
    ...(input.routingTrace ?? {}),
    state: {
      ...(input.routingTrace?.state ?? {}),
      before: summary,
      source: payload?.source ?? input.routingTrace?.state?.source,
      reasonCode: payload?.reasonCode ?? input.routingTrace?.state?.reasonCode,
      deltas: input.routingTrace?.state?.deltas ?? [],
    },
  };

  traceInfo(input, "state.before", {
    route: payload?.source,
    reasonCode: payload?.reasonCode,
    preview: formatDraftSummary(summary),
  });
}

export function recordStateDelta(input: RouteInboundMessageInput, delta: StateDeltaTrace): void {
  const nextDeltas = [...(input.routingTrace?.state?.deltas ?? []), delta];
  input.routingTrace = {
    ...(input.routingTrace ?? {}),
    state: {
      ...(input.routingTrace?.state ?? {}),
      deltaApplied: delta.applied,
      reasonCode: delta.reasonCode,
      source: delta.source,
      deltas: nextDeltas,
    },
  };

  traceInfo(input, "state.delta", {
    route: delta.source,
    reasonCode: delta.reasonCode,
    preview: formatStateDelta(delta),
  });
}

export function recordStateAfter(input: RouteInboundMessageInput, draft: DraftOrder, payload?: {
  source?: StateDeltaTrace["source"];
  reasonCode?: string;
}): void {
  const summary = summarizeDraft(draft);
  input.routingTrace = {
    ...(input.routingTrace ?? {}),
    state: {
      ...(input.routingTrace?.state ?? {}),
      after: summary,
      source: payload?.source ?? input.routingTrace?.state?.source,
      reasonCode: payload?.reasonCode ?? input.routingTrace?.state?.reasonCode,
      deltaApplied: input.routingTrace?.state?.deltaApplied ?? false,
      deltas: input.routingTrace?.state?.deltas ?? [],
    },
  };

  traceInfo(input, "state.after", {
    route: payload?.source,
    reasonCode: payload?.reasonCode,
    preview: formatDraftSummary(summary),
  });
}

export function recordReplyOutbound(input: RouteInboundMessageInput, text: string): void {
  traceInfo(input, "reply.outbound", {
    route: input.routingTrace?.state?.source,
    reasonCode: input.routingTrace?.responseReason,
    preview: text,
  });
}

export function recordHandoffTriggered(input: RouteInboundMessageInput, payload: {
  manualReason: string;
  title: string;
}): void {
  traceWarn(input, "handoff.triggered", {
    route: "system",
    reasonCode: payload.manualReason,
    preview: payload.title,
  });
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
      traceId: trace.traceId ?? null,
      turnId: trace.turnId ?? null,
      stateVersion: trace.stateVersion ?? 0,
      responseSource,
      responseReason: trace.responseReason ?? null,
      decidedAt: new Date().toISOString(),
      conversationState: input.conversation.state,
      inboundProviderMessageId: input.message.providerMessageId ?? null,
      pendingUserUtterance: trace.pendingUserUtterance ?? null,
      llm: trace.llm ?? {
        attempted: false,
        used: false,
      },
      state: {
        deltaApplied: trace.state?.deltaApplied ?? false,
        reasonCode: trace.state?.reasonCode ?? null,
        source: trace.state?.source ?? null,
        before: trace.state?.before ?? null,
        after: trace.state?.after ?? null,
        deltas: trace.state?.deltas ?? [],
      },
    },
  };
}

export async function clearLlmFailureContext(input: RouteInboundMessageInput): Promise<void> {
  const current = input.conversation.context ?? {};
  if (!current.pendingUserUtterance && !current.llmFailureStreak && !current.lastLlmFailureAt && !current.lastLlmFailureReason) {
    return;
  }

  const nextContext = {
    ...current,
    pendingUserUtterance: null,
    llmFailureStreak: 0,
    lastLlmFailureAt: null,
    lastLlmErrorClass: null,
    lastLlmFailureReason: null,
  };

  input.conversation.context = nextContext;
  input.routingTrace = {
    ...(input.routingTrace ?? {}),
    pendingUserUtterance: null,
  };

  await updateConversationContext({
    env: input.env,
    schemaName: input.tenant.schemaName,
    conversationId: input.conversation.id,
    context: nextContext,
  }).catch(() => undefined);
}

export function summarizeDraft(draft: DraftOrder): DraftSummaryTrace {
  return {
    itemCount: draft.items.reduce((sum, item) => sum + Math.max(0, item.quantity), 0),
    subtotal: draft.subtotal,
    total: draft.total,
    fulfillmentType: draft.fulfillmentType,
    paymentMethod: draft.paymentMethod,
  };
}

export function truncateForLog(value: string | undefined, maxLength = 160): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}…(+${value.length - maxLength} chars)`;
}

export function hashForLog(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `fnv1a:${(hash >>> 0).toString(16)}`;
}

type TraceEventPayload = {
  provider?: LlmProviderId;
  model?: string;
  attempt?: number;
  route?: string;
  reasonCode?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  errorClass?: LlmErrorClass;
  preview?: string;
  outputHash?: string;
  parsedItemCount?: number;
  finishReason?: string;
};

function emitTrace(
  level: "info" | "warn" | "error",
  input: RouteInboundMessageInput,
  eventName: string,
  payload: TraceEventPayload,
): void {
  initializeRoutingTrace(input);
  const event = {
    eventName,
    traceId: input.routingTrace?.traceId,
    conversationId: input.conversation.id,
    turnId: input.routingTrace?.turnId,
    messageId: input.message.providerMessageId ?? input.loggedMessageId ?? null,
    tenant: input.tenant.slug,
    tenantId: input.tenant.id,
    provider: payload.provider ?? input.routingTrace?.llm?.provider ?? null,
    model: payload.model ?? input.routingTrace?.llm?.model ?? null,
    attempt: payload.attempt ?? null,
    route: payload.route ?? null,
    reasonCode: payload.reasonCode ?? null,
    latencyMs: payload.latencyMs ?? null,
    inputTokens: payload.inputTokens ?? null,
    outputTokens: payload.outputTokens ?? null,
    stateVersion: input.routingTrace?.stateVersion ?? 0,
    conversationState: input.conversation.state,
    errorClass: payload.errorClass ?? null,
    preview: truncateForLog(payload.preview),
    outputHash: payload.outputHash ?? null,
    parsedItemCount: payload.parsedItemCount ?? null,
    finishReason: payload.finishReason ?? null,
  };

  if (level === "warn") {
    console.warn(APP_EVENT_LABEL, event);
    return;
  }

  if (level === "error") {
    console.error(APP_EVENT_LABEL, event);
    return;
  }

  console.info(APP_EVENT_LABEL, event);
}

function upsertAttempt(attempts: LlmAttemptTrace[] | undefined, candidate: LlmAttemptTrace): LlmAttemptTrace[] {
  const nextAttempts = [...(attempts ?? [])];
  const existingIndex = nextAttempts.findIndex(
    (attempt) => attempt.provider === candidate.provider && attempt.model === candidate.model && attempt.attempt === candidate.attempt,
  );

  if (existingIndex === -1) {
    nextAttempts.push(candidate);
    return nextAttempts;
  }

  nextAttempts[existingIndex] = {
    ...nextAttempts[existingIndex],
    ...candidate,
  };
  return nextAttempts;
}

function uniqueProviderChain(attempts: LlmAttemptTrace[]): string[] {
  return Array.from(new Set(attempts.map((attempt) => `${attempt.provider}:${attempt.model}`)));
}

function nextStateVersion(trace: ResponseRoutingTrace | undefined): number {
  return (trace?.stateVersion ?? 0) + 1;
}

function formatDraftSummary(summary: DraftSummaryTrace): string {
  return `items=${summary.itemCount} subtotal=${summary.subtotal} total=${summary.total} fulfillment=${summary.fulfillmentType ?? "-"} payment=${summary.paymentMethod ?? "-"}`;
}

function formatStateDelta(delta: StateDeltaTrace): string {
  const parts = [
    `applied=${delta.applied}`,
    `reason=${delta.reasonCode}`,
    `source=${delta.source}`,
  ];

  if (delta.itemName) {
    parts.push(`item=${delta.itemName}`);
  }

  if (delta.quantity !== undefined && delta.quantity !== null) {
    parts.push(`qty=${delta.quantity}`);
  }

  if (delta.subtotal !== undefined && delta.subtotal !== null) {
    parts.push(`subtotal=${delta.subtotal}`);
  }

  return parts.join(" ");
}

function formatParsedSummary(parsed: SemanticParserResult): string {
  return `intent=${parsed.intent} confidence=${parsed.confidence} items=${parsed.items.length} edits=${parsed.editActions?.length ?? 0}`;
}
