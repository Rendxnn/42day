import type { AiInputPart, AiObjectTask, JsonSchema } from "../core/types.js";

export function createObjectTask(input: {
  schemaName: string;
  outputSchema: JsonSchema;
  instructions: string;
  input: AiInputPart[];
  system?: string;
  model?: string;
  temperature?: number;
}): AiObjectTask {
  return {
    kind: "object",
    schemaName: input.schemaName,
    outputSchema: input.outputSchema,
    instructions: input.instructions,
    input: input.input,
    system: input.system,
    model: input.model,
    temperature: input.temperature,
  };
}
