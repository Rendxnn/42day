import type { RestaurantKnowledgeDocument, RestaurantKnowledgeSnapshot } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { SupabaseRestError, createSupabaseRestClient } from "../../lib/supabase-rest";
import { emptyRestaurantKnowledgeDocument, parseRestaurantKnowledgeDocument } from "./knowledge";

type RestaurantKnowledgeRow = {
  document: unknown;
  source_file_name?: string | null;
  version: number;
  updated_at?: string | null;
};

export async function loadRestaurantKnowledgeSnapshot(input: {
  env: ApiBindings;
  schemaName: string;
}): Promise<RestaurantKnowledgeSnapshot> {
  try {
    const [row] = await createSupabaseRestClient(input.env).select<RestaurantKnowledgeRow>({
      schema: input.schemaName,
      table: "restaurant_knowledge_bases",
      query: {
        select: "document,source_file_name,version,updated_at",
        singleton_key: "eq.restaurant",
        limit: 1,
      },
    });

    if (!row) return { document: emptyRestaurantKnowledgeDocument(), version: 0 };

    try {
      return {
        document: parseRestaurantKnowledgeDocument(row.document),
        sourceFileName: row.source_file_name ?? undefined,
        version: row.version,
        updatedAt: row.updated_at ?? undefined,
      };
    } catch {
      // An older malformed document should never take down the public menu.
      console.warn("carta_concierge.invalid_saved_knowledge", { schemaName: input.schemaName });
      return { document: emptyRestaurantKnowledgeDocument(), version: row.version, updatedAt: row.updated_at ?? undefined };
    }
  } catch (error) {
    // This keeps a rolling deploy safe when a worker reaches an environment in
    // which the migration has not been applied yet.
    if (error instanceof SupabaseRestError && (error.status === 404 || error.status === 400)) {
      return { document: emptyRestaurantKnowledgeDocument(), version: 0 };
    }
    throw error;
  }
}

export async function saveRestaurantKnowledgeSnapshot(input: {
  env: ApiBindings;
  schemaName: string;
  document: RestaurantKnowledgeDocument;
  sourceFileName?: string;
}): Promise<RestaurantKnowledgeSnapshot> {
  const current = await loadRestaurantKnowledgeSnapshot({ env: input.env, schemaName: input.schemaName });
  const nextVersion = Math.max(0, current.version) + 1;
  const now = new Date().toISOString();

  const [row] = await createSupabaseRestClient(input.env).upsert<RestaurantKnowledgeRow>({
    schema: input.schemaName,
    table: "restaurant_knowledge_bases",
    onConflict: "singleton_key",
    returning: "representation",
    rows: {
      singleton_key: "restaurant",
      document: input.document,
      source_file_name: input.sourceFileName?.trim() || null,
      version: nextVersion,
      updated_at: now,
    },
  });

  return {
    document: input.document,
    sourceFileName: row?.source_file_name ?? input.sourceFileName,
    version: row?.version ?? nextVersion,
    updatedAt: row?.updated_at ?? now,
  };
}
