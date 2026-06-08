import { SupabaseRestError } from "../../lib/supabase-rest";

export function isMissingTableError(error: unknown): error is SupabaseRestError {
  return (
    error instanceof SupabaseRestError &&
    (error.body.includes("Could not find the table") ||
      error.body.includes("relation") ||
      error.body.includes("does not exist"))
  );
}
