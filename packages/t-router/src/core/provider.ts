import type { AiAuthMode, AiProviderId, AiTask, AiTaskResult, ProviderCredentials } from "./types.js";

export type ProviderContext = {
  providerId: AiProviderId;
  authMode: AiAuthMode;
  credentials: ProviderCredentials;
  defaultModel?: string;
};

export interface AiProviderAdapter {
  readonly providerId: AiProviderId;
  execute<T = unknown>(input: {
    context: ProviderContext;
    task: AiTask;
  }): Promise<AiTaskResult<T>>;
}
