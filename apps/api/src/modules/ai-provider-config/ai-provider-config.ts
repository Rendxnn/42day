import type { TenantProviderConfig } from "@rendxnn/t-router";
import type { ApiBindings } from "../../lib/bindings";
import { createSupabaseRestClient } from "../../lib/supabase-rest";

type TenantAiProviderConfigRow = {
  provider_id: TenantProviderConfig["providerId"];
  auth_mode: TenantProviderConfig["authMode"];
  default_model?: string | null;
  provider_extra?: Record<string, unknown> | null;
  status: "active" | "inactive";
};

export type SemanticProviderTarget = TenantProviderConfig & {
  route: "primary" | "fallback";
};

export async function loadTenantAiProviderChain(input: {
  env: ApiBindings;
  tenantId: string;
}): Promise<SemanticProviderTarget[]> {
  const dbConfig = await loadActiveDbConfig(input).catch(() => null);
  const appEnv = input.env.APP_ENV ?? "local";
  const primaryProviderId = resolvePrimaryProviderId(dbConfig);
  const geminiModel = resolveGeminiModel(input.env, dbConfig);
  const openRouterModels = resolveOpenRouterModels(input.env, dbConfig, appEnv);
  const chain: SemanticProviderTarget[] = [];

  if (primaryProviderId === "openrouter") {
    const primaryOpenRouter = buildOpenRouterProvider(input, openRouterModels[0] ?? "openrouter/free", "primary", dbConfig);
    if (primaryOpenRouter) {
      chain.push(primaryOpenRouter);
    }

    const geminiFallback = buildGeminiProvider(input, geminiModel, "fallback", dbConfig);
    if (geminiFallback) {
      chain.push(geminiFallback);
    }
  } else {
    const primaryGemini = buildGeminiProvider(input, geminiModel, "primary", dbConfig);
    if (primaryGemini) {
      chain.push(primaryGemini);
    }

    for (const model of openRouterModels) {
      const fallback = buildOpenRouterProvider(input, model, "fallback", dbConfig);
      if (fallback) {
        chain.push(fallback);
      }
    }
  }

  return uniqueChain(chain);
}

async function loadActiveDbConfig(input: {
  env: ApiBindings;
  tenantId: string;
}): Promise<TenantAiProviderConfigRow | null> {
  const [row] = await createSupabaseRestClient(input.env).select<TenantAiProviderConfigRow>({
    schema: "control",
    table: "tenant_ai_provider_configs",
    query: {
      select: "provider_id,auth_mode,default_model,provider_extra,status",
      tenant_id: `eq.${input.tenantId}`,
      status: "eq.active",
      order: "updated_at.desc",
      limit: 1,
    },
  });

  return row ?? null;
}

function buildGeminiProvider(
  input: { env: ApiBindings; tenantId: string },
  model: string,
  route: "primary" | "fallback",
  dbConfig: TenantAiProviderConfigRow | null,
): SemanticProviderTarget | null {
  if (!input.env.GEMINI_API_KEY) {
    return null;
  }

  return {
    tenantId: input.tenantId,
    providerId: "gemini",
    authMode: "api_key",
    defaultModel: model,
    credentials: {
      apiKey: input.env.GEMINI_API_KEY,
      model,
      extra: stringifyExtra(dbConfig?.provider_extra),
    },
    route,
  };
}

function buildOpenRouterProvider(
  input: { env: ApiBindings; tenantId: string },
  model: string,
  route: "primary" | "fallback",
  dbConfig: TenantAiProviderConfigRow | null,
): SemanticProviderTarget | null {
  if (!input.env.OPENROUTER_API_KEY || !model) {
    return null;
  }

  return {
    tenantId: input.tenantId,
    providerId: "openrouter",
    authMode: "api_key",
    defaultModel: model,
    credentials: {
      apiKey: input.env.OPENROUTER_API_KEY,
      model,
      extra: {
        ...stringifyExtra(dbConfig?.provider_extra),
        "HTTP-Referer": input.env.APP_BASE_URL ?? "https://42day.app",
        "X-Title": "42day",
      },
    },
    route,
  };
}

function resolvePrimaryProviderId(dbConfig: TenantAiProviderConfigRow | null): TenantProviderConfig["providerId"] {
  if (dbConfig?.provider_id === "openrouter") {
    return "openrouter";
  }

  return "gemini";
}

function resolveGeminiModel(env: ApiBindings, dbConfig: TenantAiProviderConfigRow | null): string {
  if (dbConfig?.provider_id === "gemini" && dbConfig.default_model) {
    return dbConfig.default_model;
  }

  if (env.GEMINI_MODEL) {
    return env.GEMINI_MODEL;
  }

  return env.APP_ENV === "production" ? "gemini-2.5-flash-lite" : "gemini-2.5-flash";
}

function resolveOpenRouterModels(
  env: ApiBindings,
  dbConfig: TenantAiProviderConfigRow | null,
  appEnv: string,
): string[] {
  const extra = dbConfig?.provider_extra ?? {};
  const configuredModels = [
    asString(extra.openrouter_primary_model),
    asString(extra.openrouter_secondary_model),
    env.OPENROUTER_PRIMARY_MODEL,
    env.OPENROUTER_SECONDARY_MODEL,
  ].filter((value): value is string => Boolean(value?.trim()));

  if (configuredModels.length > 0) {
    return configuredModels;
  }

  if (env.OPENROUTER_USE_FREE_ROUTER === "true") {
    return ["openrouter/free"];
  }

  if (appEnv === "production") {
    return [];
  }

  return [
    "openai/gpt-oss-120b:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
  ];
}

function stringifyExtra(extra: Record<string, unknown> | null | undefined): Record<string, string> | undefined {
  if (!extra) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(extra).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : [])),
  );
}

function uniqueChain(chain: SemanticProviderTarget[]): SemanticProviderTarget[] {
  const seen = new Set<string>();
  const next: SemanticProviderTarget[] = [];

  for (const provider of chain) {
    const key = `${provider.providerId}:${provider.defaultModel ?? provider.credentials.model ?? ""}:${provider.route}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push(provider);
  }

  return next;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
