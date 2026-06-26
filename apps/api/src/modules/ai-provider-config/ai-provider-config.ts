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

type SupportedProviderConfig = TenantProviderConfig & {
  providerId: "gemini" | "openrouter";
};

export async function loadTenantAiProviderConfig(input: {
  env: ApiBindings;
  tenantId: string;
}): Promise<SupportedProviderConfig | null> {
  const dbConfig = await loadActiveDbConfig(input).catch(() => null);
  const providerId = dbConfig?.provider_id ?? "gemini";
  return buildProviderConfig({
    env: input.env,
    tenantId: input.tenantId,
    providerId,
    defaultModel: dbConfig?.default_model ?? undefined,
    providerExtra: dbConfig?.provider_extra,
  });
}

export async function loadTenantAiFallbackProviderConfig(input: {
  env: ApiBindings;
  tenantId: string;
  excludeProviderId?: TenantProviderConfig["providerId"];
}): Promise<SupportedProviderConfig | null> {
  const fallbackOrder: Array<TenantProviderConfig["providerId"]> = ["openrouter"];

  for (const providerId of fallbackOrder) {
    if (providerId === input.excludeProviderId) {
      continue;
    }

    const config = buildProviderConfig({
      env: input.env,
      tenantId: input.tenantId,
      providerId,
    });

    if (config) {
      return config;
    }
  }

  return null;
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

function stringifyExtra(extra: Record<string, unknown> | null | undefined): Record<string, string> | undefined {
  if (!extra) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(extra).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : [])),
  );
}

function buildProviderConfig(input: {
  env: ApiBindings;
  tenantId: string;
  providerId: TenantProviderConfig["providerId"];
  defaultModel?: string;
  providerExtra?: Record<string, unknown> | null;
}): SupportedProviderConfig | null {
  const extra = stringifyExtra(input.providerExtra);

  if (input.providerId === "gemini") {
    const defaultModel = input.defaultModel ?? input.env.GEMINI_MODEL ?? "gemini-2.5-flash";

    if (!input.env.GEMINI_API_KEY) {
      return null;
    }

    return {
      tenantId: input.tenantId,
      providerId: "gemini",
      authMode: "api_key",
      defaultModel,
      credentials: {
        apiKey: input.env.GEMINI_API_KEY,
        model: defaultModel,
        extra,
      },
    };
  }

  if (input.providerId === "openrouter") {
    const defaultModel = input.defaultModel ?? input.env.OPENROUTER_MODEL ?? "openrouter/auto";

    if (!input.env.OPENROUTER_API_KEY) {
      return null;
    }

    return {
      tenantId: input.tenantId,
      providerId: "openrouter",
      authMode: "api_key",
      defaultModel,
      credentials: {
        apiKey: input.env.OPENROUTER_API_KEY,
        model: defaultModel,
        extra,
      },
    };
  }

  return null;
}
