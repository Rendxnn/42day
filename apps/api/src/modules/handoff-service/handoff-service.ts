import type { HumanInterventionType } from "@42day/types";

export type HumanInterventionAlertDraft = {
  type: HumanInterventionType;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
};

export function createHumanInterventionAlert(input: HumanInterventionAlertDraft): HumanInterventionAlertDraft {
  return input;
}
