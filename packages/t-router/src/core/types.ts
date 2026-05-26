export type AiProviderId = "openai" | "openrouter" | "gemini" | "anthropic" | "custom";

export type AiAuthMode = "api_key" | "oauth" | "custom";

export type AiTaskKind = "text" | "object";

export type AiInputPart =
  | { type: "text"; text: string }
  | { type: "image_url"; url: string; detail?: "low" | "high" | "auto" }
  | { type: "image_base64"; data: string; mimeType: string; detail?: "low" | "high" | "auto" }
  | { type: "file_uri"; uri: string; mimeType?: string }
  | { type: "file_url"; url: string; mimeType?: string };

export type JsonSchema = Record<string, unknown>;

export type AiTextTask = {
  kind: "text";
  system?: string;
  instructions: string;
  input: AiInputPart[];
  temperature?: number;
  model?: string;
};

export type AiObjectTask = {
  kind: "object";
  schemaName: string;
  outputSchema: JsonSchema;
  system?: string;
  instructions: string;
  input: AiInputPart[];
  temperature?: number;
  model?: string;
};

export type AiTask = AiTextTask | AiObjectTask;

export type ProviderCredentials = {
  apiKey?: string;
  accessToken?: string;
  baseUrl?: string;
  googleCloudProjectId?: string;
  model?: string;
  extra?: Record<string, string>;
};

export type TenantProviderConfig = {
  tenantId?: string;
  providerId: AiProviderId;
  authMode: AiAuthMode;
  credentials: ProviderCredentials;
  defaultModel?: string;
  fallbackProviderId?: AiProviderId;
};

export type AiTextResult = {
  kind: "text";
  providerId: AiProviderId;
  model: string;
  outputText: string;
  raw?: unknown;
};

export type AiObjectResult<T = unknown> = {
  kind: "object";
  providerId: AiProviderId;
  model: string;
  outputText: string;
  outputObject: T;
  raw?: unknown;
};

export type AiTaskResult<T = unknown> = AiTextResult | AiObjectResult<T>;
