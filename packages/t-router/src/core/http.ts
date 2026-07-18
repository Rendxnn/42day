import { AiRouterError } from "../errors/AiRouterError.js";

export type ProviderFetch = typeof fetch;

export async function fetchWithTimeout(
  fetcher: ProviderFetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetcher(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiRouterError("provider_timeout", "AI provider request timed out.");
    }

    throw new AiRouterError("provider_network_error", "AI provider network request failed.", error);
  } finally {
    clearTimeout(timeout);
  }
}

export async function assertProviderResponse(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  const body = await response.text().catch(() => "");
  const parsed = parseProviderErrorBody(body);
  const diagnostic = {
    httpStatus: response.status,
    upstreamCode: parsed.code,
    upstreamStatus: parsed.status,
  };

  if (response.status === 401 || response.status === 403 || parsed.code === 401 || parsed.code === 403) {
    throw new AiRouterError("provider_auth_failed", parsed.message || "AI provider rejected the credentials.", diagnostic);
  }

  if (response.status === 408 || response.status === 504 || parsed.code === 408 || parsed.code === 504) {
    throw new AiRouterError("provider_timeout", parsed.message || "AI provider request timed out.", diagnostic);
  }

  if (
    response.status === 402 ||
    response.status === 429 ||
    parsed.code === 402 ||
    parsed.code === 429 ||
    parsed.status === "RESOURCE_EXHAUSTED" ||
    isQuotaError(parsed.message)
  ) {
    throw new AiRouterError("provider_quota_exceeded", parsed.message || "AI provider quota is exhausted.", diagnostic);
  }

  if (
    response.status === 502 ||
    response.status === 503 ||
    response.status === 529 ||
    parsed.code === 502 ||
    parsed.code === 503 ||
    parsed.code === 529 ||
    parsed.status === "UNAVAILABLE" ||
    parsed.message.toLowerCase().includes("no available model provider")
  ) {
    throw new AiRouterError("provider_unavailable", parsed.message || "AI provider is unavailable.", diagnostic);
  }

  if (response.status >= 500) {
    throw new AiRouterError("provider_unavailable", parsed.message || "AI provider is unavailable.", diagnostic);
  }

  throw new AiRouterError("provider_unknown_error", parsed.message || `AI provider failed with status ${response.status}.`, diagnostic);
}

export function parseProviderErrorBody(body: string): {
  code?: number | string;
  message: string;
  status?: string;
} {
  if (!body.trim()) {
    return { message: "" };
  }

  try {
    const payload = JSON.parse(body) as unknown;
    const errorPayload = isRecord(payload) && isRecord(payload.error) ? payload.error : payload;

    return {
      message: isRecord(errorPayload) && typeof errorPayload.message === "string" ? errorPayload.message : body,
      status: isRecord(errorPayload) && typeof errorPayload.status === "string" ? errorPayload.status : undefined,
      code:
        isRecord(errorPayload) && (typeof errorPayload.code === "string" || typeof errorPayload.code === "number")
          ? errorPayload.code
          : undefined,
    };
  } catch {
    return { message: body };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isQuotaError(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("quota") ||
    normalized.includes("rate limit") ||
    normalized.includes("daily limit") ||
    normalized.includes("free tier") ||
    normalized.includes("credits")
  );
}
