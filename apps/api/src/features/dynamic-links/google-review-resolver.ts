import {
  GOOGLE_REVIEW_URL_MAX_LENGTH,
  buildGoogleReviewUrl,
  classifyGoogleReviewUrl,
  extractGoogleMapsFeatureId,
} from "@42day/core";
import type { GoogleReviewResolution, GoogleReviewSourceKind } from "@42day/types";

const MAX_REDIRECTS = 5;
const PER_FETCH_TIMEOUT_MS = 3_000;
const TOTAL_TIMEOUT_MS = 8_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type Fetcher = typeof fetch;

type ResolverOptions = {
  fetcher?: Fetcher;
  now?: () => number;
};

export type GoogleReviewResolutionResult = {
  resolution: GoogleReviewResolution;
  redirectCount: number;
};

export class GoogleReviewResolutionError extends Error {
  readonly code: string;
  readonly status: 400 | 422 | 502 | 504;

  constructor(code: string, status: 400 | 422 | 502 | 504) {
    super(code);
    this.name = "GoogleReviewResolutionError";
    this.code = code;
    this.status = status;
  }
}

export async function resolveGoogleReviewDestination(
  input: string,
  options: ResolverOptions = {},
): Promise<GoogleReviewResolutionResult> {
  const normalizedInput = normalizeInput(input);
  const initialClassification = classifyGoogleReviewUrl(normalizedInput);
  if (initialClassification.kind === "unsupported") {
    throw new GoogleReviewResolutionError("google_review_url_unsupported", 400);
  }

  if (initialClassification.kind === "direct_review_url") {
    return {
      resolution: createResolution(initialClassification.kind, initialClassification.normalizedUrl),
      redirectCount: 0,
    };
  }

  const initialFeatureId = extractGoogleMapsFeatureId(initialClassification.normalizedUrl);
  if (initialFeatureId.kind === "ambiguous") {
    throw new GoogleReviewResolutionError("google_review_identifier_ambiguous", 422);
  }
  if (initialFeatureId.kind === "found") {
    return {
      resolution: createResolution(
        initialClassification.kind,
        buildGoogleReviewUrl(initialFeatureId.featureId),
        candidateLabelFromUrl(initialClassification.normalizedUrl),
      ),
      redirectCount: 0,
    };
  }
  if (initialClassification.kind === "maps_business_url") {
    throw new GoogleReviewResolutionError("google_review_identifier_missing", 422);
  }

  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const startedAt = now();
  const visited = new Set([initialClassification.normalizedUrl]);
  let currentUrl = initialClassification.normalizedUrl;
  let redirectCount = 0;

  while (redirectCount < MAX_REDIRECTS) {
    const remainingMs = TOTAL_TIMEOUT_MS - (now() - startedAt);
    if (remainingMs <= 0) throw timeoutError();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(PER_FETCH_TIMEOUT_MS, remainingMs),
    );

    let response: Response;
    try {
      response = await fetcher(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) throw timeoutError();
      throw new GoogleReviewResolutionError("google_review_upstream_failed", 502);
    } finally {
      clearTimeout(timeout);
    }

    const location = response.headers.get("location");
    const status = response.status;
    discardResponseBody(response);

    if (!REDIRECT_STATUSES.has(status)) {
      if (status >= 200 && status < 300) {
        throw new GoogleReviewResolutionError("google_review_identifier_missing", 422);
      }
      if (status >= 300 && status < 400) {
        throw new GoogleReviewResolutionError("google_review_redirect_invalid", 502);
      }
      throw new GoogleReviewResolutionError("google_review_upstream_failed", 502);
    }
    if (!location || location.length > GOOGLE_REVIEW_URL_MAX_LENGTH) {
      throw new GoogleReviewResolutionError("google_review_redirect_invalid", 502);
    }

    const nextUrl = resolveRedirectLocation(location, currentUrl);
    const nextClassification = classifyGoogleReviewUrl(nextUrl);
    if (nextClassification.kind === "unsupported" || visited.has(nextClassification.normalizedUrl)) {
      throw new GoogleReviewResolutionError("google_review_redirect_invalid", 502);
    }

    redirectCount += 1;
    visited.add(nextClassification.normalizedUrl);

    if (nextClassification.kind === "direct_review_url") {
      return {
        resolution: createResolution(
          initialClassification.kind,
          nextClassification.normalizedUrl,
          candidateLabelFromUrl(nextClassification.normalizedUrl),
        ),
        redirectCount,
      };
    }

    const extraction = extractGoogleMapsFeatureId(nextClassification.normalizedUrl);
    if (extraction.kind === "ambiguous") {
      throw new GoogleReviewResolutionError("google_review_identifier_ambiguous", 422);
    }
    if (extraction.kind === "found") {
      return {
        resolution: createResolution(
          initialClassification.kind,
          buildGoogleReviewUrl(extraction.featureId),
          candidateLabelFromUrl(nextClassification.normalizedUrl),
        ),
        redirectCount,
      };
    }

    currentUrl = nextClassification.normalizedUrl;
  }

  throw new GoogleReviewResolutionError("google_review_redirect_invalid", 502);
}

function normalizeInput(input: string) {
  const normalized = input.trim().replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (!normalized || normalized.length > GOOGLE_REVIEW_URL_MAX_LENGTH) {
    throw new GoogleReviewResolutionError("google_review_url_invalid", 400);
  }
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new GoogleReviewResolutionError("google_review_url_invalid", 400);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new GoogleReviewResolutionError("google_review_url_invalid", 400);
  }
  return url.toString();
}

function createResolution(
  sourceKind: GoogleReviewSourceKind,
  reviewUrl: string,
  candidateLabel?: string,
): GoogleReviewResolution {
  return {
    sourceKind,
    reviewUrl,
    ...(candidateLabel ? { candidateLabel } : {}),
    confirmationRequired: true,
  };
}

function candidateLabelFromUrl(value: string) {
  const url = new URL(value);
  const segments = url.pathname.split("/").filter(Boolean);
  const placeIndex = segments.findIndex((segment) => segment.toLowerCase() === "place");
  const rawLabel = placeIndex >= 0 ? segments[placeIndex + 1] : undefined;
  if (!rawLabel) return undefined;
  try {
    const label = decodeURIComponent(rawLabel).replaceAll("+", " ").trim();
    return label && label.length <= 120 ? label : undefined;
  } catch {
    return undefined;
  }
}

function resolveRedirectLocation(location: string, currentUrl: string) {
  try {
    return new URL(location, currentUrl).toString();
  } catch {
    throw new GoogleReviewResolutionError("google_review_redirect_invalid", 502);
  }
}

function discardResponseBody(response: Response) {
  if (!response.body) return;
  void response.body.cancel().catch(() => {
    // A failed cancellation does not make the already-received redirect unsafe.
  });
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function timeoutError() {
  return new GoogleReviewResolutionError("google_review_resolution_timeout", 504);
}
