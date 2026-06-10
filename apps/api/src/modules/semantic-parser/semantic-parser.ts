import { AiProviderRouter, createObjectTask, GeminiAdapter, OpenRouterAdapter, type AiRouterError, type AiTaskResult } from "@rendxnn/t-router";
import type { Conversation, TodayMenuPayload } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { loadTenantAiProviderChain, type SemanticProviderTarget } from "../ai-provider-config/ai-provider-config";
import type { LlmErrorClass } from "../../features/chat-routing/types";

export type SemanticOrderItem = {
  quantity?: number;
  productText: string;
  confidence?: number;
  optionTexts?: Array<{
    groupText?: string;
    valueText: string;
    confidence?: number;
  }>;
  notes?: string[];
};

export type SemanticOrderEditAction = {
  type: "add" | "remove" | "replace" | "set_quantity";
  targetText?: string | null;
  productText?: string | null;
  quantity?: number | null;
  confidence?: number;
  optionTexts?: SemanticOrderItem["optionTexts"];
  notes?: string[];
};

export type SemanticParserResult = {
  intent: "order" | "order_edit" | "menu" | "support" | "unknown";
  confidence: number;
  items: SemanticOrderItem[];
  editActions?: SemanticOrderEditAction[];
  fulfillmentText?: string | null;
  paymentText?: string | null;
  addressText?: string | null;
  confirmationText?: string | null;
  needsHuman?: boolean;
  questions?: string[];
};

export type SemanticParserAttemptEvent =
  | {
      type: "request";
      provider: SemanticProviderTarget["providerId"];
      model: string;
      route: SemanticProviderTarget["route"];
      attempt: number;
      estimatedInputTokens: number;
      inputPreview: string;
    }
  | {
      type: "response";
      provider: SemanticProviderTarget["providerId"];
      model: string;
      route: SemanticProviderTarget["route"];
      attempt: number;
      latencyMs: number;
      preview: string;
      outputHash: string;
      finishReason?: string;
      inputTokens?: number;
      outputTokens?: number;
      parsed: SemanticParserResult;
      raw?: unknown;
    }
  | {
      type: "error";
      provider: SemanticProviderTarget["providerId"];
      model: string;
      route: SemanticProviderTarget["route"];
      attempt: number;
      latencyMs: number;
      errorClass: LlmErrorClass;
      reasonCode: string;
      message: string;
    };

export type SemanticParserExecution = {
  parsed: SemanticParserResult;
  provider: SemanticProviderTarget["providerId"];
  model: string;
  attempt: number;
  route: SemanticProviderTarget["route"];
  preview: string;
  outputHash: string;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  raw?: unknown;
};

export async function parseFreeFormOrder(input: {
  env: ApiBindings;
  tenantId: string;
  rawMessage: string;
  activeMenu: TodayMenuPayload;
  conversationState: Conversation["state"];
  observeAttempt?: (event: SemanticParserAttemptEvent) => void;
}): Promise<SemanticParserExecution> {
  const providers = await loadTenantAiProviderChain({
    env: input.env,
    tenantId: input.tenantId,
  });

  if (providers.length === 0) {
    throw new Error("semantic_parser.not_configured");
  }

  const task = createObjectTask({
    schemaName: "semantic_order_parse",
    outputSchema: semanticOrderSchema,
    temperature: 0,
    instructions: [
      "Extrae estructura desde un mensaje de WhatsApp de un cliente de restaurante.",
      "Devuelve solo textos mencionados por el usuario y confianza.",
      "No inventes productos, precios, IDs, disponibilidad ni totales.",
      "Si el usuario pide asesor, marca intent support o needsHuman.",
      "Si parece pedido, usa intent order.",
      "Si el usuario quiere quitar, cambiar, reemplazar o ajustar productos de un pedido existente, usa intent order_edit y editActions.",
      "Para cambios como 'quitemos la sopa por 2 limonadas', devuelve remove/replace/add con targetText y productText como textos del usuario.",
      "Si hay opciones o notas como sin cebolla, sopa de frijoles, jugo de mora, preservalas como textos.",
      "Si el usuario menciona el grupo de una opcion, conservalo en groupText.",
      "No conviertas una nota libre en valor de catalogo si el usuario no lo dijo claramente.",
    ].join("\n"),
    input: [
      {
        type: "text",
        text: JSON.stringify({
          conversationState: input.conversationState,
          message: input.rawMessage,
          menu: summarizeMenu(input.activeMenu),
        }),
      },
    ],
  });

  const inputPreview = truncateForLog(input.rawMessage, 160);
  const estimatedInputTokens = estimateTokens(JSON.stringify({
    conversationState: input.conversationState,
    message: input.rawMessage,
    menu: summarizeMenu(input.activeMenu),
  }));
  const maxAttempts = 3;
  const deadline = Date.now() + 6000;
  let attempt = 0;
  let lastError: Error | null = null;

  for (const provider of providers) {
    while (attempt < maxAttempts) {
      attempt += 1;
      const remainingBudgetMs = deadline - Date.now();
      if (remainingBudgetMs <= 350) {
        break;
      }

      const model = provider.defaultModel ?? provider.credentials.model ?? "unknown";
      input.observeAttempt?.({
        type: "request",
        provider: provider.providerId,
        model,
        route: provider.route,
        attempt,
        estimatedInputTokens,
        inputPreview,
      });

      const startedAt = Date.now();

      try {
        const result = await runObjectTask<SemanticParserResult>({
          provider,
          task,
          timeoutMs: Math.max(900, Math.min(2400, remainingBudgetMs - reserveBackoff(attempt))),
        });
        const latencyMs = Date.now() - startedAt;
        const rawMetrics = extractRawMetrics(provider.providerId, result.raw);
        const preview = truncateForLog(result.outputText, 160);
        const outputHash = hashForLog(result.outputText);
        const parsed = result.outputObject;

        input.observeAttempt?.({
          type: "response",
          provider: provider.providerId,
          model: result.model,
          route: provider.route,
          attempt,
          latencyMs,
          preview,
          outputHash,
          finishReason: rawMetrics.finishReason,
          inputTokens: rawMetrics.inputTokens ?? estimatedInputTokens,
          outputTokens: rawMetrics.outputTokens,
          parsed,
          raw: input.env.LOG_RAW_LLM_PAYLOADS === "true" ? result.raw : undefined,
        });

        return {
          parsed,
          provider: provider.providerId,
          model: result.model,
          route: provider.route,
          attempt,
          preview,
          outputHash,
          finishReason: rawMetrics.finishReason,
          inputTokens: rawMetrics.inputTokens ?? estimatedInputTokens,
          outputTokens: rawMetrics.outputTokens,
          raw: result.raw,
        };
      } catch (error) {
        lastError = normalizeSemanticError(error);
        const latencyMs = Date.now() - startedAt;
        const classified = classifyLlmError(error);

        input.observeAttempt?.({
          type: "error",
          provider: provider.providerId,
          model,
          route: provider.route,
          attempt,
          latencyMs,
          errorClass: classified.errorClass,
          reasonCode: classified.reasonCode,
          message: lastError.message,
        });

        if (classified.errorClass !== "transient_capacity" || attempt >= maxAttempts) {
          break;
        }

        const delayMs = computeRetryDelayMs(attempt);
        if (Date.now() + delayMs >= deadline) {
          break;
        }
        await sleep(delayMs);
      }
    }
  }

  throw lastError ?? new Error("semantic_parser.failed_without_result");
}

function summarizeMenu(menu: TodayMenuPayload): Record<string, unknown> {
  return {
    location: menu.location?.name,
    items: menu.items.map((item, index) => ({
      index: index + 1,
      name: item.displayName ?? item.product?.name,
      aliases: [...(item.aliases ?? []), ...(item.product?.aliases ?? [])],
      product: item.product
        ? {
            name: item.product.name,
            aliases: item.product.aliases ?? [],
            category: item.product.category,
            options: item.product.options?.slice(0, 4).map((option) => ({
              name: option.name,
              type: option.type,
              required: option.isRequired,
              values:
                option.type === "text"
                  ? undefined
                  : option.values
                    .filter((value) => value.isActive)
                    .slice(0, 6)
                    .map((value) => value.name),
            })),
          }
        : undefined,
    })),
  };
}

const semanticOrderSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "confidence", "items"],
  properties: {
    intent: {
      type: "string",
      enum: ["order", "order_edit", "menu", "support", "unknown"],
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["productText"],
        properties: {
          quantity: {
            type: "number",
            minimum: 1,
          },
          productText: {
            type: "string",
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
          optionTexts: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["valueText"],
              properties: {
                groupText: { type: "string" },
                valueText: { type: "string" },
                confidence: {
                  type: "number",
                  minimum: 0,
                  maximum: 1,
                },
              },
            },
          },
          notes: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
    editActions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type"],
        properties: {
          type: {
            type: "string",
            enum: ["add", "remove", "replace", "set_quantity"],
          },
          targetText: {
            type: ["string", "null"],
          },
          productText: {
            type: ["string", "null"],
          },
          quantity: {
            type: ["number", "null"],
            minimum: 0,
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
          optionTexts: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["valueText"],
              properties: {
                groupText: { type: "string" },
                valueText: { type: "string" },
                confidence: {
                  type: "number",
                  minimum: 0,
                  maximum: 1,
                },
              },
            },
          },
          notes: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
    fulfillmentText: {
      type: ["string", "null"],
    },
    paymentText: {
      type: ["string", "null"],
    },
    addressText: {
      type: ["string", "null"],
    },
    confirmationText: {
      type: ["string", "null"],
    },
    needsHuman: {
      type: "boolean",
    },
    questions: {
      type: "array",
      items: { type: "string" },
    },
  },
};

async function runObjectTask<T>(input: {
  provider: SemanticProviderTarget;
  task: ReturnType<typeof createObjectTask>;
  timeoutMs: number;
}): Promise<Extract<AiTaskResult<T>, { kind: "object" }>> {
  const router = new AiProviderRouter([
    new GeminiAdapter(fetch, input.timeoutMs),
    new OpenRouterAdapter(fetch, input.timeoutMs),
  ]);
  const result = await router.run<T>({
    provider: input.provider,
    task: input.task,
  });

  if (result.kind !== "object") {
    throw new Error("semantic_parser.expected_object_result");
  }

  return result;
}

function classifyLlmError(error: unknown): {
  errorClass: LlmErrorClass;
  reasonCode: string;
} {
  const candidate = error as Partial<AiRouterError> & { code?: string };
  const code = candidate?.code ?? "";
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (code === "provider_unavailable") {
    return { errorClass: "transient_capacity", reasonCode: code };
  }

  if (code === "provider_quota_exceeded") {
    return { errorClass: "quota_exceeded", reasonCode: code };
  }

  if (code === "provider_timeout") {
    return { errorClass: "timeout", reasonCode: code };
  }

  if (code === "provider_auth_failed" || code === "provider_not_configured") {
    return { errorClass: "provider_auth", reasonCode: code };
  }

  if (code === "provider_invalid_response" || message.includes("json") || message.includes("schema")) {
    return { errorClass: "schema_invalid", reasonCode: code || "schema_invalid" };
  }

  return { errorClass: "unknown_provider_failure", reasonCode: code || "unknown_provider_failure" };
}

function normalizeSemanticError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

function extractRawMetrics(providerId: SemanticProviderTarget["providerId"], raw: unknown): {
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
} {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  if (providerId === "gemini") {
    const payload = raw as {
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      };
      candidates?: Array<{ finishReason?: string }>;
    };

    return {
      inputTokens: payload.usageMetadata?.promptTokenCount,
      outputTokens: payload.usageMetadata?.candidatesTokenCount,
      finishReason: payload.candidates?.[0]?.finishReason,
    };
  }

  const payload = raw as {
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
    };
    choices?: Array<{ finish_reason?: string }>;
  };

  return {
    inputTokens: payload.usage?.prompt_tokens,
    outputTokens: payload.usage?.completion_tokens,
    finishReason: payload.choices?.[0]?.finish_reason,
  };
}

function computeRetryDelayMs(attempt: number): number {
  if (attempt <= 1) {
    return jitter(400, 900);
  }

  return jitter(1500, 2500);
}

function reserveBackoff(attempt: number): number {
  return attempt >= 2 ? 400 : 1500;
}

function jitter(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function truncateForLog(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}…(+${value.length - maxLength} chars)`;
}

function hashForLog(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `fnv1a:${(hash >>> 0).toString(16)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
