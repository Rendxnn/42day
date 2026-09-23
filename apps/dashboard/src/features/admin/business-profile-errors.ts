import { BUSINESS_PROFILE_ERROR_MESSAGES, businessProfileErrorMessage } from "@42day/types";
import { DashboardApiError } from "../../api";

const FIELD_LABELS: Array<[RegExp, string]> = [
  [/^displayName$/, "Nombre"],
  [/^headline$/, "Titular"],
  [/^locationName$/, "Sede"],
  [/^address$/, "Dirección"],
  [/^slug$/, "Slug"],
  [/^links\[\d+\]\.label$/, "Etiqueta del enlace"],
  [/^links\[\d+\]\.href$/, "Enlace"],
  [/^links\[\d+\]\.kind$/, "Tipo de enlace"],
  [/^links\[\d+\]\.enabled$/, "Activación del enlace"],
  [/^links\[\d+\]\.sortOrder$/, "Orden del enlace"],
];

export function formatBusinessProfileError(error: unknown, fallback = "No se pudo completar la operación.") {
  if (!(error instanceof DashboardApiError)) {
    return error instanceof TypeError
      ? "No se pudo conectar con ParaHoy. Revisa tu conexión e inténtalo de nuevo."
      : fallback;
  }

  const backendMessage = error.backendMessage?.trim() ?? "";
  const isSafeBackendMessage = Boolean(backendMessage)
    && backendMessage !== error.backendError
    && !/(supabase|postgrest|postgres|sql|stack|exception|undefined|null)/i.test(backendMessage);
  const message = error.backendError && BUSINESS_PROFILE_ERROR_MESSAGES[error.backendError]
    ? businessProfileErrorMessage(error.backendError)
    : isSafeBackendMessage
      ? backendMessage
      : fallback;
  const fieldPath = error.field;
  const field = fieldPath ? FIELD_LABELS.find(([pattern]) => pattern.test(fieldPath))?.[1] : undefined;
  return field ? `${field}: ${message}` : message;
}
