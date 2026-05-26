import type { AiInputPart, AiTextTask } from "../core/types.js";

export function createTextTask(input: {
  instructions: string;
  input: AiInputPart[];
  system?: string;
  model?: string;
  temperature?: number;
}): AiTextTask {
  return {
    kind: "text",
    instructions: input.instructions,
    input: input.input,
    system: input.system,
    model: input.model,
    temperature: input.temperature,
  };
}
