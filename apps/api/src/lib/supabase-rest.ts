import type { ApiBindings } from "./bindings";

export type SupabaseRestClient = {
  select: <T = Record<string, unknown>>(input: {
    schema: string;
    table: string;
    query?: Record<string, string | number | boolean | undefined>;
  }) => Promise<T[]>;
  insert: (input: {
    schema: string;
    table: string;
    rows: Record<string, unknown> | Array<Record<string, unknown>>;
  }) => Promise<void>;
  insertReturning: <T = Record<string, unknown>>(input: {
    schema: string;
    table: string;
    rows: Record<string, unknown> | Array<Record<string, unknown>>;
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
  uploadObject: (input: {
    bucket: string;
    path: string;
    body: Blob;
    contentType: string;
    upsert?: boolean;
  }) => Promise<{ path: string; publicUrl: string }>;
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
  const buildUrl = (
    table: string,
    query?: Record<string, string | number | boolean | undefined>,
  ) => {
    const url = new URL(`${baseUrl}/rest/v1/${table}`);

    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });

    return url.toString();
  };

  const serviceRoleHeaders = (schema: string, prefer?: string) => ({
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    "Accept-Profile": schema,
    "Content-Profile": schema,
    ...(prefer ? { Prefer: prefer } : {}),
  });

  async function parseResponse<T>(response: Response, operation: string): Promise<T> {
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new SupabaseRestError(operation, response.status, errorText);
    }

    return response.json() as Promise<T>;
  }

  return {
    async select(input) {
      const response = await fetch(buildUrl(input.table, input.query), {
        method: "GET",
        headers: serviceRoleHeaders(input.schema),
      });

      return parseResponse(response, `supabase_select_failed:${input.schema}.${input.table}`);
    },
    async insert(input) {
      const response = await fetch(buildUrl(input.table), {
        method: "POST",
        headers: serviceRoleHeaders(input.schema, "return=minimal"),
        body: JSON.stringify(input.rows),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new SupabaseRestError(`supabase_insert_failed:${input.schema}.${input.table}`, response.status, errorText);
      }
    },
    async insertReturning(input) {
      const response = await fetch(buildUrl(input.table), {
        method: "POST",
        headers: serviceRoleHeaders(input.schema, "return=representation"),
        body: JSON.stringify(input.rows),
      });

      return parseResponse(response, `supabase_insert_failed:${input.schema}.${input.table}`);
    },
    async updateReturning(input) {
      const response = await fetch(buildUrl(input.table, input.query), {
        method: "PATCH",
        headers: serviceRoleHeaders(input.schema, "return=representation"),
        body: JSON.stringify(input.patch),
      });

      return parseResponse(response, `supabase_update_failed:${input.schema}.${input.table}`);
    },
    async delete(input) {
      const response = await fetch(buildUrl(input.table, input.query), {
        method: "DELETE",
        headers: serviceRoleHeaders(input.schema, "return=minimal"),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new SupabaseRestError(`supabase_delete_failed:${input.schema}.${input.table}`, response.status, errorText);
      }
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
  };
}
