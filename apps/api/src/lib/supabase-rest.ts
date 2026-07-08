import type { ApiBindings } from "./bindings.ts";

export type SupabaseRestClient = {
  select: <T = Record<string, unknown>>(input: {
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
  insertReturning: <T = Record<string, unknown>>(input: {
    schema: string;
    table: string;
    rows: Record<string, unknown> | Array<Record<string, unknown>>;
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
  updateReturning: <T = Record<string, unknown>>(input: {
    schema: string;
    table: string;
    query: Record<string, string | number | boolean | undefined>;
    patch: Record<string, unknown>;
  }) => Promise<T[]>;
  delete: (input: {
    schema: string;
    table: string;
    query: Record<string, string | number | boolean | undefined>;
  }) => Promise<void>;
  rpc: <T = Record<string, unknown>>(input: {
    schema: string;
    functionName: string;
    args?: Record<string, unknown>;
  }) => Promise<T>;
  uploadObject: (input: {
    bucket: string;
    path: string;
    body: Blob;
    contentType: string;
    upsert?: boolean;
  }) => Promise<{ path: string; publicUrl: string }>;
  deleteObject: (input: {
    bucket: string;
    path: string;
  }) => Promise<void>;
};

export class SupabaseRestError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(
    message: string,
    status: number,
    body: string,
  ) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export function createSupabaseRestClient(env: ApiBindings): SupabaseRestClient {
  const baseUrl = env.SUPABASE_URL.replace(/\/$/, "");

  return {
    async select<T = Record<string, unknown>>(input: {
      schema: string;
      table: string;
      query?: Record<string, string | number | boolean | undefined>;
    }) {
      const response = await fetch(buildUrl(baseUrl, input.table, input.query), {
        method: "GET",
        headers: buildHeaders(env, input.schema),
      });

      return parseResponse<T[]>(response, `supabase_select_failed:${input.schema}.${input.table}`);
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

      return input.returning === "representation"
        ? parseResponse<T[]>(response, `supabase_insert_failed:${input.schema}.${input.table}`)
        : [];
    },

    async insertReturning<T = Record<string, unknown>>(input: {
      schema: string;
      table: string;
      rows: Record<string, unknown> | Array<Record<string, unknown>>;
    }) {
      return this.insert<T>({
        ...input,
        returning: "representation",
      });
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

      return input.returning === "representation"
        ? parseResponse<T[]>(response, `supabase_upsert_failed:${input.schema}.${input.table}`)
        : [];
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

      return input.returning === "representation"
        ? parseResponse<T[]>(response, `supabase_update_failed:${input.schema}.${input.table}`)
        : [];
    },

    async updateReturning<T = Record<string, unknown>>(input: {
      schema: string;
      table: string;
      query: Record<string, string | number | boolean | undefined>;
      patch: Record<string, unknown>;
    }) {
      return this.update<T>({
        schema: input.schema,
        table: input.table,
        query: input.query,
        values: input.patch,
        returning: "representation",
      });
    },

    async delete(input) {
      const response = await fetch(buildUrl(baseUrl, input.table, input.query), {
        method: "DELETE",
        headers: buildHeaders(env, input.schema, {
          Prefer: "return=minimal",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new SupabaseRestError(`supabase_delete_failed:${input.schema}.${input.table}`, response.status, errorText);
      }
    },

    async rpc<T = Record<string, unknown>>(input: {
      schema: string;
      functionName: string;
      args?: Record<string, unknown>;
    }) {
      const response = await fetch(`${baseUrl}/rest/v1/rpc/${input.functionName}`, {
        method: "POST",
        headers: buildHeaders(env, input.schema),
        body: JSON.stringify(input.args ?? {}),
      });

      return parseResponse<T>(response, `supabase_rpc_failed:${input.schema}.${input.functionName}`);
    },

    async uploadObject(input) {
      const encodedPath = input.path
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");
      const response = await fetch(`${baseUrl}/storage/v1/object/${input.bucket}/${encodedPath}`, {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": input.contentType,
          ...(input.upsert ? { "x-upsert": "true" } : {}),
        },
        body: input.body,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new SupabaseRestError(`supabase_storage_upload_failed:${input.bucket}/${input.path}`, response.status, errorText);
      }

      return {
        path: input.path,
        publicUrl: `${baseUrl}/storage/v1/object/public/${input.bucket}/${encodedPath}`,
      };
    },

    async deleteObject(input) {
      const encodedPath = input.path
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");
      const response = await fetch(`${baseUrl}/storage/v1/object/${input.bucket}/${encodedPath}`, {
        method: "DELETE",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new SupabaseRestError(`supabase_storage_delete_failed:${input.bucket}/${input.path}`, response.status, errorText);
      }
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

async function parseResponse<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new SupabaseRestError(operation, response.status, errorText);
  }

  return response.json() as Promise<T>;
}
