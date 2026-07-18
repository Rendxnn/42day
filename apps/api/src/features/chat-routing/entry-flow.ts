import type { DetectedSignals } from "../../modules/message-router/signal-detector";

/**
 * Only explicit, non-mutating entry controls bypass semantic interpretation.
 * Every other text—including a first natural-language order—must reach the
 * semantic operation planner.
 */
export function resolveEntryFlowAction(signals: Pick<DetectedSignals, "humanRequested" | "wantsMenu" | "isGreeting">): "handoff" | "show_menu" | null {
  if (signals.humanRequested) {
    return "handoff";
  }

  if (signals.wantsMenu || signals.isGreeting) {
    return "show_menu";
  }

  return null;
}
