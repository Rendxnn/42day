import type { HumanInterventionStatus } from "@42day/types";
import { createSupabaseRestClient } from "../../../lib/supabase-rest";
import type { AlertRow } from "../types";

export async function selectAlerts(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  options: {
    status?: HumanInterventionStatus;
    limit?: number;
  } = {},
): Promise<AlertRow[]> {
  return supabase.select<AlertRow>({
    schema,
    table: "human_intervention_alerts",
    query: {
      select: "id,conversation_id,draft_order_id,order_id,type,status,title,description,metadata,created_at,resolved_at",
      ...(options.status ? { status: `eq.${options.status}` } : {}),
      order: "created_at.desc",
      limit: options.limit ?? 100,
    },
  });
}
