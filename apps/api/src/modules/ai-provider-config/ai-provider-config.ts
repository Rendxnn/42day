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

export async function loadTenantAiProviderConfig(input: {
  env: ApiBindings;
  tenantId: string;
}): Promise<TenantProviderConfig | null> {
  const dbConfig = await loadActiveDbConfig(input).catch(() => null);
  const providerId = dbConfig?.provider_id ?? "gemini";
  const defaultModel = dbConfig?.default_model ?? input.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  if (providerId !== "gemini") {
    return null;
  }

  // MVP path: use env secret now, while the DB row shape is ready for encrypted per-tenant keys.
  if (!input.env.GEMINI_API_KEY) {
    return null;
  }

  return {
    tenantId: input.tenantId,
    providerId,
    authMode: "api_key",
    defaultModel,
    credentials: {
      apiKey: input.env.GEMINI_API_KEY,
      model: defaultModel,
      extra: stringifyExtra(dbConfig?.provider_extra),
    },
  };
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
