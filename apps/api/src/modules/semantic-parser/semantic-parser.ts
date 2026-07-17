import { AiProviderRouter, AiRouterError, createObjectTask, GeminiAdapter, OpenRouterAdapter } from "@rendxnn/t-router";
import type { Conversation, TodayMenuPayload } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { loadTenantAiFallbackProviderConfig, loadTenantAiProviderConfig } from "../ai-provider-config/ai-provider-config";

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

export type SemanticDraftFacts = {
  fulfillmentText?: string | null;
  fulfillmentConfidence?: number;
  paymentText?: string | null;
  paymentConfidence?: number;
  deliveryAddressText?: string | null;
  deliveryAddressDetails?: string | null;
  deliveryAddressConfidence?: number;
  billing?: {
    type?: "normal" | "electronic" | null;
    fullName?: string | null;
    billingAddress?: string | null;
    legalName?: string | null;
    taxId?: string | null;
    email?: string | null;
    confidence?: number;
  } | null;
};

export type SemanticTextDirectives = {
  isGreeting?: boolean;
  greetingConfidence?: number;
  continueCheckout?: boolean;
  continueCheckoutConfidence?: number;
  confirmation?: "yes" | "no" | "change" | null;
  confirmationConfidence?: number;
  billingDecision?: "reuse" | "change" | "switch_to_electronic" | null;
  billingDecisionConfidence?: number;
  replacementChoiceText?: string | null;
  replacementRejectAll?: boolean;
  replacementConfidence?: number;
  transferFallbackDecision?: "cash" | "transfer" | "confirm_cash" | "reject_cash" | null;
  transferFallbackConfidence?: number;
  productConfiguration?: {
    optionTexts?: Array<{
      groupText?: string;
      valueText: string;
      confidence?: number;
    }>;
    notes?: string[];
    confidence?: number;
  } | null;
};

export type SemanticParserResult = {
  intent: "order" | "order_edit" | "menu" | "support" | "unknown";
  confidence: number;
  items: SemanticOrderItem[];
  editActions?: SemanticOrderEditAction[];
  fulfillmentText?: string | null;
  paymentText?: string | null;
  addressText?: string | null;
  addressDetails?: string | null;
  confirmationText?: string | null;
  draftFacts?: SemanticDraftFacts;
  textDirectives?: SemanticTextDirectives;
  needsHuman?: boolean;
  questions?: string[];
};

export type SemanticParserExecutionResult = {
  providerId: "gemini" | "openrouter";
  parsed: SemanticParserResult;
  fallbackFromProviderId?: "gemini" | "openrouter";
};

export type SemanticStateDirectiveResult = {
  providerId: "gemini" | "openrouter";
  directives: SemanticTextDirectives;
  fallbackFromProviderId?: "gemini" | "openrouter";
};

export async function parseFreeFormOrder(input: {
  env: ApiBindings;
  tenantId: string;
  rawMessage: string;
  activeMenu: TodayMenuPayload;
  conversationState: Conversation["state"];
  stateContext?: Record<string, unknown>;
}): Promise<SemanticParserExecutionResult> {
  const router = new AiProviderRouter([new GeminiAdapter(), new OpenRouterAdapter()]);
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
      "Usa textDirectives para respuestas conversacionales dependientes del estado: saludo, continuar al siguiente paso, confirmar, rechazar, pedir cambios, reutilizar o cambiar facturación, cambiar a factura electrónica, elegir o rechazar reemplazos, aceptar efectivo en fallback o insistir en transferencia, y responder una configuración pendiente.",
      "Cuando el usuario proporcione una dirección, separa la parte geocodificable en addressText (vía, número, barrio y municipio) y los detalles para el domiciliario en addressDetails (apto, torre, unidad, casa, portería o referencia). No inventes detalles ni los mezcles en la dirección que se valida.",
      "Extrae en draftFacts los datos independientes que el usuario entregue antes de que se los preguntemos: tipo de entrega, pago, dirección de entrega, detalles de entrega y facturación. Incluye la confianza de cada dato.",
      "Para facturacion normal usa fullName y billingAddress si fueron dichos. Para electronica exige legalName, taxId y email. Incluye confidence para billing.",
      "Si el usuario dice algo como 'asi esta bien', 'sigamos', 'eso es todo' o equivalente, marca textDirectives.continueCheckout en true con confianza.",
      "Si el usuario responde con si, no o cambio segun el contexto, usa textDirectives.confirmation.",
      "Si el contexto es de reutilizar facturacion, usa textDirectives.billingDecision con reuse, change o switch_to_electronic.",
      "Si el contexto es de reemplazo, usa replacementChoiceText o replacementRejectAll.",
      "Si el contexto es de fallback de transferencia, usa transferFallbackDecision.",
      "Si el contexto es de configuracion pendiente, llena textDirectives.productConfiguration.optionTexts con los valores elegidos y notes con instrucciones libres relevantes.",
      "Para cambios como 'quitemos la sopa por 2 limonadas', devuelve remove/replace/add con targetText y productText como textos del usuario.",
      "Si hay opciones o notas como sin cebolla, sopa de frijoles, jugo de mora, preservalas como textos.",
      "Si el usuario menciona el grupo de una opcion, conservalo en groupText.",
      "Cuando una cantidad mayor a 1 del mismo producto comparte las mismas opciones, devuelve un solo item con esa quantity y sus optionTexts; no dupliques el producto ni repartas opciones entre unidades salvo que el usuario describa configuraciones distintas.",
      "Los productos adicionales mencionados aparte (por ejemplo huevos o caldo) deben salir como items independientes si existen en el menu.",
      "No conviertas una nota libre en valor de catalogo si el usuario no lo dijo claramente.",
    ].join("\n"),
    input: [
      {
        type: "text",
        text: JSON.stringify({
          conversationState: input.conversationState,
          message: input.rawMessage,
          stateContext: input.stateContext ?? null,
          menu: summarizeMenu(input.activeMenu),
        }),
      },
    ],
  });

  const execution = await generateSemanticObject<SemanticParserResult>({
    env: input.env,
    tenantId: input.tenantId,
    router,
    task,
  });

  return {
    providerId: execution.providerId,
    parsed: execution.output,
    fallbackFromProviderId: execution.fallbackFromProviderId,
  };
}

export async function parseSemanticStateDirectives(input: {
  env: ApiBindings;
  tenantId: string;
  rawMessage: string;
  conversationState: Conversation["state"];
  stateContext?: Record<string, unknown>;
}): Promise<SemanticStateDirectiveResult> {
  const router = new AiProviderRouter([new GeminiAdapter(), new OpenRouterAdapter()]);
  const task = createObjectTask({
    schemaName: "semantic_state_directives",
    outputSchema: semanticStateDirectivesSchema,
    temperature: 0,
    instructions: [
      "Interpreta una respuesta corta de WhatsApp segun el estado actual de la conversacion.",
      "Devuelve solo textDirectives y sus confidencias.",
      "No inventes productos, IDs, precios ni datos no dichos por el usuario.",
      "Usa stateContext.lastAssistantPrompt como la pregunta exacta que el bot acaba de hacer y resuelve la respuesta del usuario contra esa pregunta.",
      "Usa stateContext.expectedActions o expectedActions dentro de cada subcontexto para elegir una accion valida del estado actual.",
      "Respuestas como 'si', 'yes', 'ok', 'asi esta bien', 'dejala igual' o equivalentes deben mapearse a la accion afirmativa correcta del estado actual, no a una accion generica.",
      "Si el estado es awaiting_billing_reuse_confirmation, usa billingDecision con reuse, change o switch_to_electronic.",
      "Si el estado es awaiting_more_items, usa continueCheckout cuando el cliente quiera seguir al siguiente paso.",
      "Si el estado es awaiting_confirmation, usa confirmation con yes, no o change.",
      "Si el estado es awaiting_replacement_selection, usa replacementChoiceText o replacementRejectAll.",
      "Si el estado es awaiting_transfer_fallback_payment_method, usa transferFallbackDecision.",
      "Si el estado es awaiting_product_configuration, usa productConfiguration.optionTexts y notes.",
      "Usa isGreeting solo si el mensaje realmente es un saludo.",
      "Si no puedes decidir con claridad, deja los campos vacios o nulos.",
    ].join("\n"),
    input: [
      {
        type: "text",
        text: JSON.stringify({
          conversationState: input.conversationState,
          message: input.rawMessage,
          stateContext: input.stateContext ?? null,
        }),
      },
    ],
  });

  const execution = await generateSemanticObject<SemanticTextDirectives>({
    env: input.env,
    tenantId: input.tenantId,
    router,
    task,
  });

  return {
    providerId: execution.providerId,
    directives: execution.output,
    fallbackFromProviderId: execution.fallbackFromProviderId,
  };
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
    addressDetails: {
      type: ["string", "null"],
    },
    confirmationText: {
      type: ["string", "null"],
    },
    draftFacts: {
      type: "object",
      additionalProperties: false,
      properties: {
        fulfillmentText: { type: ["string", "null"] },
        fulfillmentConfidence: { type: "number", minimum: 0, maximum: 1 },
        paymentText: { type: ["string", "null"] },
        paymentConfidence: { type: "number", minimum: 0, maximum: 1 },
        deliveryAddressText: { type: ["string", "null"] },
        deliveryAddressDetails: { type: ["string", "null"] },
        deliveryAddressConfidence: { type: "number", minimum: 0, maximum: 1 },
        billing: {
          type: ["object", "null"],
          additionalProperties: false,
          properties: {
            type: { type: ["string", "null"], enum: ["normal", "electronic", null] },
            fullName: { type: ["string", "null"] },
            billingAddress: { type: ["string", "null"] },
            legalName: { type: ["string", "null"] },
            taxId: { type: ["string", "null"] },
            email: { type: ["string", "null"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      },
    },
    textDirectives: {
      type: "object",
      additionalProperties: false,
      properties: {
        isGreeting: { type: "boolean" },
        greetingConfidence: { type: "number", minimum: 0, maximum: 1 },
        continueCheckout: { type: "boolean" },
        continueCheckoutConfidence: { type: "number", minimum: 0, maximum: 1 },
        confirmation: {
          type: ["string", "null"],
          enum: ["yes", "no", "change", null],
        },
        confirmationConfidence: { type: "number", minimum: 0, maximum: 1 },
        billingDecision: {
          type: ["string", "null"],
          enum: ["reuse", "change", "switch_to_electronic", null],
        },
        billingDecisionConfidence: { type: "number", minimum: 0, maximum: 1 },
        replacementChoiceText: { type: ["string", "null"] },
        replacementRejectAll: { type: "boolean" },
        replacementConfidence: { type: "number", minimum: 0, maximum: 1 },
        transferFallbackDecision: {
          type: ["string", "null"],
          enum: ["cash", "transfer", "confirm_cash", "reject_cash", null],
        },
        transferFallbackConfidence: { type: "number", minimum: 0, maximum: 1 },
        productConfiguration: {
          type: ["object", "null"],
          additionalProperties: false,
          properties: {
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
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      },
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

const semanticStateDirectivesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    isGreeting: { type: "boolean" },
    greetingConfidence: { type: "number", minimum: 0, maximum: 1 },
    continueCheckout: { type: "boolean" },
    continueCheckoutConfidence: { type: "number", minimum: 0, maximum: 1 },
    confirmation: {
      type: ["string", "null"],
      enum: ["yes", "no", "change", null],
    },
    confirmationConfidence: { type: "number", minimum: 0, maximum: 1 },
    billingDecision: {
      type: ["string", "null"],
      enum: ["reuse", "change", "switch_to_electronic", null],
    },
    billingDecisionConfidence: { type: "number", minimum: 0, maximum: 1 },
    replacementChoiceText: { type: ["string", "null"] },
    replacementRejectAll: { type: "boolean" },
    replacementConfidence: { type: "number", minimum: 0, maximum: 1 },
    transferFallbackDecision: {
      type: ["string", "null"],
      enum: ["cash", "transfer", "confirm_cash", "reject_cash", null],
    },
    transferFallbackConfidence: { type: "number", minimum: 0, maximum: 1 },
    productConfiguration: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
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
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
    },
  },
};

async function generateSemanticObject<T>(input: {
  env: ApiBindings;
  tenantId: string;
  router: AiProviderRouter;
  task: ReturnType<typeof createObjectTask>;
}): Promise<{
  providerId: "gemini" | "openrouter";
  output: T;
  fallbackFromProviderId?: "gemini" | "openrouter";
}> {
  const provider = await loadTenantAiProviderConfig({
    env: input.env,
    tenantId: input.tenantId,
  });

  if (!provider) {
    throw new Error("semantic_parser.not_configured");
  }

  try {
    return {
      providerId: provider.providerId,
      output: await input.router.generateObject<T>({
        provider,
        task: input.task,
      }),
    };
  } catch (error) {
    if (!shouldAttemptFallback(error)) {
      throw error;
    }

    const fallbackProvider = await loadTenantAiFallbackProviderConfig({
      env: input.env,
      tenantId: input.tenantId,
      excludeProviderId: provider.providerId,
    });

    if (!fallbackProvider) {
      throw error;
    }

    return {
      providerId: fallbackProvider.providerId,
      output: await input.router.generateObject<T>({
        provider: fallbackProvider,
        task: input.task,
      }),
      fallbackFromProviderId: provider.providerId,
    };
  }
}

function shouldAttemptFallback(error: unknown): error is AiRouterError {
  return error instanceof AiRouterError
    && (
      error.code === "provider_quota_exceeded" ||
      error.code === "provider_unavailable" ||
      error.code === "provider_timeout" ||
      error.code === "provider_network_error"
    );
}
