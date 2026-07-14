import type { ConversationState, HumanInterventionType } from "@42day/types";

export const routingHandoffAlertTypes = [
  "support_requested",
  "parser_failed",
  "validation_failed_repeatedly",
  "technical_error",
  "order_change_requested",
] as const satisfies readonly HumanInterventionType[];

export function resolvesOnConversationAutomationResume(type: HumanInterventionType): boolean {
  return (routingHandoffAlertTypes as readonly HumanInterventionType[]).includes(type);
}

export function getAutomationTransition(input: {
  enabled: boolean;
  state: ConversationState;
  resumeState?: ConversationState;
}): { state: ConversationState; resumeState?: ConversationState } {
  if (!input.enabled) {
    return {
      state: "manual",
      resumeState: input.state === "manual"
        ? (input.resumeState ?? "awaiting_mode_selection")
        : input.state,
    };
  }

  return {
    state: input.state === "manual"
      ? (input.resumeState ?? "awaiting_mode_selection")
      : input.state,
  };
}
