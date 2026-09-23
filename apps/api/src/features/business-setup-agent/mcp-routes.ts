import { Hono } from "hono";
import { z } from "zod";
import { businessProfileErrorMessage } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings.ts";
import { parseBusinessProfileListRequest } from "../public-profile/business-profile-pagination.ts";
import { BusinessProfileValidationError } from "../public-profile/business-profile-validation.ts";
import { BusinessSetupAgentError, commitBusinessSetup, getAgentProfile, listAgentProfiles, prepareBusinessSetup } from "./service.ts";
import { requireAgentContext, type AgentContext } from "./auth.ts";

type JsonRpcRequest = {
  jsonrpc?: unknown;
  id?: string | number | null;
  method?: unknown;
  params?: unknown;
};

export const businessSetupMcpRoutes = new Hono<{ Bindings: ApiBindings }>();

const profileListInput = z.object({
  query: z.string().max(120).optional(),
  status: z.enum(["draft", "published", "disabled"]).optional(),
  association: z.enum(["linked", "generic"]).optional(),
  sort: z.enum(["updatedAt", "createdAt", "displayName", "slug", "status"]).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  pageSize: z.union([z.literal(25), z.literal(50), z.literal(100)]).optional(),
  cursor: z.string().max(2048).optional(),
}).strict();

const prepareInput = z.object({
  business: z.object({
    displayName: z.string().min(1).max(160),
    locationName: z.string().max(160).optional(),
    address: z.string().max(500).optional(),
    headline: z.string().max(180).optional(),
    tenantId: z.string().uuid().nullable().optional(),
    links: z.array(z.object({
      kind: z.enum(["menu", "google_review", "instagram", "tiktok", "website", "whatsapp", "phone", "facebook", "maps", "survey", "custom"]),
      label: z.string().max(120).optional(),
      href: z.string().min(1).max(2048),
      enabled: z.boolean().optional(),
    })).max(30),
  }).strict(),
  qrCode: z.string().min(1).max(120),
}).strict();

const commitInput = z.object({
  preparationId: z.string().uuid(),
  preparationToken: z.string().min(16).max(256),
  operationId: z.string().uuid(),
  confirmed: z.literal(true),
  activeQrConsent: z.boolean().optional(),
  duplicateDecision: z.union([
    z.literal("create_new"),
    z.object({ reuseProfileId: z.string().uuid() }).strict(),
  ]),
}).strict();

const toolDefinitions = [
  {
    name: "parahoy_get_connected_account",
    description: "Devuelve la cuenta ParaHoy conectada y el alcance administrativo del agente.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "parahoy_list_business_profiles",
    description: "Busca y pagina perfiles de negocio existentes en ParaHoy.",
    inputSchema: { type: "object", properties: { query: { type: "string", maxLength: 120 }, status: { enum: ["draft", "published", "disabled"] }, association: { enum: ["linked", "generic"] }, sort: { enum: ["updatedAt", "createdAt", "displayName", "slug", "status"] }, direction: { enum: ["asc", "desc"] }, pageSize: { enum: [25, 50, 100] }, cursor: { type: "string" } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "parahoy_get_business_profile",
    description: "Obtiene un perfil de negocio y sus enlaces activables.",
    inputSchema: { type: "object", properties: { profileId: { type: "string", format: "uuid" } }, required: ["profileId"], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "parahoy_prepare_business_setup",
    description: "Prepara una propuesta para crear o reutilizar un perfil y asignarlo a un QR. No modifica datos y devuelve advertencias, coincidencias y un token de confirmación de corta duración.",
    inputSchema: { type: "object", properties: { business: { type: "object", properties: { displayName: { type: "string", minLength: 1, maxLength: 160 }, locationName: { type: "string", maxLength: 160 }, address: { type: "string", maxLength: 500 }, headline: { type: "string", maxLength: 180 }, tenantId: { type: ["string", "null"], format: "uuid" }, links: { type: "array", maxItems: 30, items: { type: "object", properties: { kind: { enum: ["menu", "google_review", "instagram", "tiktok", "website", "whatsapp", "phone", "facebook", "maps", "survey", "custom"] }, label: { type: "string", maxLength: 120 }, href: { type: "string", minLength: 1, maxLength: 2048 }, enabled: { type: "boolean" } }, required: ["kind", "href"], additionalProperties: false } } }, required: ["displayName", "links"], additionalProperties: false }, qrCode: { type: "string", minLength: 1, maxLength: 120 } }, required: ["business", "qrCode"], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "parahoy_commit_business_setup",
    description: "Confirma atómicamente la propuesta preparada, publica o reutiliza el perfil y asigna el QR. Requiere consentimiento explícito para un QR activo.",
    inputSchema: { type: "object", properties: { preparationId: { type: "string", format: "uuid" }, preparationToken: { type: "string" }, operationId: { type: "string", format: "uuid" }, confirmed: { const: true }, activeQrConsent: { type: "boolean" }, duplicateDecision: { oneOf: [{ const: "create_new" }, { type: "object", required: ["reuseProfileId"] }] } }, required: ["preparationId", "preparationToken", "operationId", "confirmed", "duplicateDecision"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
] as const;

businessSetupMcpRoutes.post("/mcp", async (c) => {
  const actor = await requireAgentContext(c);
  if (actor instanceof Response) return actor;
  const contentLength = Number(c.req.header("Content-Length") ?? 0);
  if (contentLength > 256 * 1024) return jsonRpcError(null, -32600, "Request too large");
  const body = await c.req.json().catch(() => undefined) as JsonRpcRequest | undefined;
  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") return jsonRpcError(null, -32600, "Invalid Request");
  const id = body.id ?? null;
  try {
    switch (body.method) {
      case "initialize":
        return jsonRpcResult(id, { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "parahoy-business-setup", version: "1.0.0" } });
      case "notifications/initialized":
        return new Response(null, { status: 202 });
      case "tools/list":
        return jsonRpcResult(id, { tools: toolDefinitions });
      case "tools/call":
        return await handleToolCall(c.env, actor, id, body.params);
      default:
        return jsonRpcError(id, -32601, "Method not found");
    }
  } catch (error) {
    if (error instanceof z.ZodError) return toolError(id, "invalid_tool_input", "Revisa los campos y formatos enviados para esta herramienta.");
    if (error instanceof BusinessSetupAgentError) return toolError(id, error.code, businessProfileErrorMessage(error.code, "La propuesta no pudo procesarse."));
    if (error instanceof BusinessProfileValidationError) return toolError(id, error.code, error.message);
    return toolError(id, "internal_server_error", "La operación no pudo completarse. Inténtalo de nuevo.");
  }
});

async function handleToolCall(env: ApiBindings, actor: AgentContext, id: string | number | null, params: unknown) {
  const input = z.object({ name: z.string(), arguments: z.unknown().optional() }).strict().parse(params);
  switch (input.name) {
    case "parahoy_get_connected_account":
      return toolResult(id, input.name, { userId: actor.userId, email: actor.email, clientId: actor.clientId, role: "system_admin", environment: env.APP_ENV });
    case "parahoy_list_business_profiles": {
      const parsed = profileListInput.parse(input.arguments ?? {});
      const query = new URL("https://mcp.local/admin/business-profiles");
      for (const [key, value] of Object.entries(parsed)) if (value !== undefined) query.searchParams.set(key, String(value));
      return toolResult(id, input.name, await listAgentProfiles(env, parseBusinessProfileListRequest(query)));
    }
    case "parahoy_get_business_profile": {
      const parsed = z.object({ profileId: z.string().uuid() }).strict().parse(input.arguments ?? {});
      return toolResult(id, input.name, await getAgentProfile(env, parsed.profileId));
    }
    case "parahoy_prepare_business_setup":
      return toolResult(id, input.name, await prepareBusinessSetup(env, actor, prepareInput.parse(input.arguments)));
    case "parahoy_commit_business_setup":
      return toolResult(id, input.name, await commitBusinessSetup(env, actor, commitInput.parse(input.arguments)));
    default:
      return toolError(id, "tool_not_found", `Herramienta desconocida: ${input.name}`);
  }
}

function toolResult(id: string | number | null, name: string, value: unknown) {
  return jsonRpcResult(id, { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value, _meta: { tool: name } });
}

function toolError(id: string | number | null, code: string, message: string) {
  return jsonRpcResult(id, { isError: true, content: [{ type: "text", text: JSON.stringify({ error: code, message }) }], structuredContent: { error: code, message } });
}

function jsonRpcResult(id: string | number | null, result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { headers: { "Content-Type": "application/json" } });
}

function jsonRpcError(id: string | number | null, code: number, message: string) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), { status: 400, headers: { "Content-Type": "application/json" } });
}
