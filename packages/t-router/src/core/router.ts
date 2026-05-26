import { AiRouterError } from "../errors/AiRouterError.js";
import type { AiProviderAdapter } from "./provider.js";
import type { AiObjectTask, AiTask, AiTaskResult, TenantProviderConfig } from "./types.js";

export class AiProviderRouter {
  private readonly providers = new Map<string, AiProviderAdapter>();

  constructor(providers: AiProviderAdapter[]) {
    for (const provider of providers) {
      this.providers.set(provider.providerId, provider);
    }
  }

  async run<T = unknown>(input: {
    provider: TenantProviderConfig;
    task: AiTask;
  }): Promise<AiTaskResult<T>> {
    const adapter = this.providers.get(input.provider.providerId);

    if (!adapter) {
      throw new AiRouterError(
        "provider_not_registered",
        `No adapter registered for provider ${input.provider.providerId}.`,
      );
    }

    return adapter.execute<T>({
      context: {
        providerId: input.provider.providerId,
        authMode: input.provider.authMode,
        credentials: input.provider.credentials,
        defaultModel: input.provider.defaultModel,
      },
      task: input.task,
    });
  }

  async generateObject<T = unknown>(input: {
    provider: TenantProviderConfig;
    task: AiObjectTask;
  }): Promise<T> {
    const result = await this.run<T>(input);

    if (result.kind !== "object") {
      throw new AiRouterError("router_invalid_task", "Provider returned text for an object task.");
    }

    return result.outputObject as T;
  }
}
