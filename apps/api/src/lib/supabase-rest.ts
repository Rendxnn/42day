import type { ApiBindings } from "./bindings";

export type SupabaseRestClient = {
  insert: (input: {
    schema: string;
    table: string;
    rows: Record<string, unknown> | Array<Record<string, unknown>>;
  }) => Promise<void>;
};

export class SupabaseRestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
  }
}

export function createSupabaseRestClient(env: ApiBindings): SupabaseRestClient {
  const baseUrl = env.SUPABASE_URL.replace(/\/$/, "");

  return {
    async insert(input) {
      const response = await fetch(`${baseUrl}/rest/v1/${input.table}`, {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          "Accept-Profile": input.schema,
          "Content-Profile": input.schema,
          Prefer: "return=minimal",
        },
        body: JSON.stringify(input.rows),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new SupabaseRestError(`supabase_insert_failed:${input.schema}.${input.table}`, response.status, errorText);
      }
    },
  };
}
