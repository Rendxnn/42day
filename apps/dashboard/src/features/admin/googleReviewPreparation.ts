import type { GoogleReviewResolution } from "@42day/types";

export type GoogleReviewPreparationState =
  | { status: "idle" }
  | { status: "resolving"; input: string }
  | { status: "resolved"; input: string; resolution: GoogleReviewResolution; previewOpened: boolean }
  | { status: "confirmed"; input: string; resolution: GoogleReviewResolution }
  | { status: "failed"; input: string; errorCode: string };

export function hasPotentialGoogleReviewUrl(value: string) {
  let url: URL;
  try {
    url = new URL(normalizePreparationInput(value));
  } catch {
    return false;
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  return (
    hostname === "google.com"
    || hostname.endsWith(".google.com")
    || hostname === "g.page"
    || hostname.endsWith(".g.page")
    || hostname === "goo.gl"
    || hostname === "maps.app.goo.gl"
    || hostname === "maps.app"
    || hostname.endsWith(".maps.app")
  );
}

export function beginGoogleReviewPreparation(input: string): GoogleReviewPreparationState {
  return { status: "resolving", input: normalizePreparationInput(input) };
}

export function resolveGoogleReviewPreparation(
  state: GoogleReviewPreparationState,
  resolution: GoogleReviewResolution,
): GoogleReviewPreparationState {
  if (state.status !== "resolving") return state;
  return { status: "resolved", input: state.input, resolution, previewOpened: false };
}

export function failGoogleReviewPreparation(
  input: string,
  errorCode: string,
): GoogleReviewPreparationState {
  return { status: "failed", input: normalizePreparationInput(input), errorCode };
}

export function markGoogleReviewPreviewOpened(
  state: GoogleReviewPreparationState,
): GoogleReviewPreparationState {
  if (state.status !== "resolved") return state;
  return { ...state, previewOpened: true };
}

export function confirmGoogleReviewPreparation(
  state: GoogleReviewPreparationState,
): GoogleReviewPreparationState {
  if (state.status !== "resolved" || !state.previewOpened) return state;
  return { status: "confirmed", input: state.input, resolution: state.resolution };
}

export function destinationForQuickSetupSave(
  input: string,
  state: GoogleReviewPreparationState,
  currentDestination?: string,
) {
  const normalizedInput = normalizePreparationInput(input);
  if (!hasPotentialGoogleReviewUrl(normalizedInput)) return normalizedInput;
  if (sameUrl(normalizedInput, currentDestination)) return normalizedInput;
  if (state.status !== "confirmed" || state.input !== normalizedInput) return undefined;
  return state.resolution.reviewUrl;
}

function normalizePreparationInput(value: string) {
  return value.trim().replace(/[\u200B-\u200D\uFEFF]/g, "");
}

function sameUrl(left: string, right?: string) {
  if (!right) return false;
  try {
    return new URL(left).toString() === new URL(right.trim()).toString();
  } catch {
    return left === right.trim();
  }
}
