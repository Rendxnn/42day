import type { ApiBindings } from "./bindings";

export type SupabaseRestClient = {
  select: <T>(input: {
    schema: string;
    table: string;
    query?: Record<string, string | number | boolean | undefined>;
  }) => Promise<T[]>;
  insert: <T = Record<string, unknown>>(input: {
    schema: string;
    table: string;
    rows: Record<string, unknown> | Array<Record<string, unknown>>;
    returning?: "minimal" | "representation";
  }) => Promise<T[]>;
  upsert: <T = Record<string, unknown>>(input: {
    schema: string;
    table: string;
    rows: Record<string, unknown> | Array<Record<string, unknown>>;
    onConflict: string;
    returning?: "minimal" | "representation";
  }) => Promise<T[]>;
  update: <T = Record<string, unknown>>(input: {
    schema: string;
    table: string;
    values: Record<string, unknown>;
    query: Record<string, string | number | boolean | undefined>;
    returning?: "minimal" | "representation";
  }) => Promise<T[]>;
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
    async select<T>(input: {
      schema: string;
      table: string;
      query?: Record<string, string | number | boolean | undefined>;
    }) {
      const response = await fetch(buildUrl(baseUrl, input.table, input.query), {
        method: "GET",
        headers: buildHeaders(env, input.schema),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new SupabaseRestError(`supabase_select_failed:${input.schema}.${input.table}`, response.status, errorText);
      }

      return (await response.json()) as T[];
    },

    async insert<T = Record<string, unknown>>(input: {
      schema: string;
      table: string;
      rows: Record<string, unknown> | Array<Record<string, unknown>>;
      returning?: "minimal" | "representation";
    }) {
      const response = await fetch(buildUrl(baseUrl, input.table), {
        method: "POST",
        headers: buildHeaders(env, input.schema, {
          Prefer: `return=${input.returning ?? "minimal"}`,
        }),
        body: JSON.stringify(input.rows),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new SupabaseRestError(`supabase_insert_failed:${input.schema}.${input.table}`, response.status, errorText);
      }

      return input.returning === "representation" ? ((await response.json()) as T[]) : [];
    },

    async upsert<T = Record<string, unknown>>(input: {
      schema: string;
      table: string;
      rows: Record<string, unknown> | Array<Record<string, unknown>>;
      onConflict: string;
      returning?: "minimal" | "representation";
    }) {
      const response = await fetch(buildUrl(baseUrl, input.table, { on_conflict: input.onConflict }), {
        method: "POST",
        headers: buildHeaders(env, input.schema, {
          Prefer: `resolution=merge-duplicates,return=${input.returning ?? "minimal"}`,
        }),
        body: JSON.stringify(input.rows),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new SupabaseRestError(`supabase_upsert_failed:${input.schema}.${input.table}`, response.status, errorText);
      }

      return input.returning === "representation" ? ((await response.json()) as T[]) : [];
    },

    async update<T = Record<string, unknown>>(input: {
      schema: string;
      table: string;
      values: Record<string, unknown>;
      query: Record<string, string | number | boolean | undefined>;
      returning?: "minimal" | "representation";
    }) {
      const response = await fetch(buildUrl(baseUrl, input.table, input.query), {
        method: "PATCH",
        headers: buildHeaders(env, input.schema, {
          Prefer: `return=${input.returning ?? "minimal"}`,
        }),
        body: JSON.stringify(input.values),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new SupabaseRestError(`supabase_update_failed:${input.schema}.${input.table}`, response.status, errorText);
      }

      return input.returning === "representation" ? ((await response.json()) as T[]) : [];
    },
  };
}

function buildUrl(baseUrl: string, table: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${baseUrl}/rest/v1/${table}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function buildHeaders(env: ApiBindings, schema: string, extra?: Record<string, string>): HeadersInit {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    "Accept-Profile": schema,
    "Content-Profile": schema,
    ...extra,
  };
}
