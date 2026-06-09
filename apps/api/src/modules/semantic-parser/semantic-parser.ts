import { AiProviderRouter, createObjectTask, GeminiAdapter } from "@rendxnn/t-router";
import type { Conversation, TodayMenuPayload } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { loadTenantAiProviderConfig } from "../ai-provider-config/ai-provider-config";

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

export async function parseFreeFormOrder(input: {
  env: ApiBindings;
  tenantId: string;
  rawMessage: string;
  activeMenu: TodayMenuPayload;
  conversationState: Conversation["state"];
}): Promise<SemanticParserResult> {
  const provider = await loadTenantAiProviderConfig({
    env: input.env,
    tenantId: input.tenantId,
  });

  if (!provider) {
    throw new Error("semantic_parser.not_configured");
  }

  const router = new AiProviderRouter([new GeminiAdapter()]);
  return router.generateObject<SemanticParserResult>({
    provider,
    task: createObjectTask({
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
    }),
  });
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
