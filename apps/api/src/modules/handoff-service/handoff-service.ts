import type { HumanInterventionType } from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";
import { createSupabaseRestClient } from "../../lib/supabase-rest";

export type HumanInterventionAlertDraft = {
  type: HumanInterventionType;
  title: string;
  description: string;
  conversationId?: string;
  draftOrderId?: string;
  orderId?: string;
  metadata?: Record<string, unknown>;
};

export function createHumanInterventionAlert(input: HumanInterventionAlertDraft): HumanInterventionAlertDraft {
  return input;
}

export async function persistHumanInterventionAlert(input: {
  env: ApiBindings;
  schemaName: string;
  alert: HumanInterventionAlertDraft;
}): Promise<void> {
  await createSupabaseRestClient(input.env).insert({
    schema: input.schemaName,
    table: "human_intervention_alerts",
    rows: {
      conversation_id: input.alert.conversationId ?? null,
      draft_order_id: input.alert.draftOrderId ?? null,
      order_id: input.alert.orderId ?? null,
      type: input.alert.type,
      title: input.alert.title,
      description: input.alert.description,
      metadata: input.alert.metadata ?? null,
      status: "open",
    },
  });
}
