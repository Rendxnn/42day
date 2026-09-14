const messages: Record<string, string> = {
  google_review_url_invalid: "Pega un enlace HTTPS de Google Maps o un enlace directo de reseña.",
  google_review_url_unsupported: "Este enlace de Google no contiene una ficha que podamos convertir. Abre el negocio en Maps y usa Compartir.",
  google_review_identifier_missing: "Google abrió el enlace, pero no encontramos la ficha del negocio. Pega un enlace directo de reseña.",
  google_review_identifier_ambiguous: "El enlace contiene más de una ficha y no es seguro elegir una automáticamente.",
  google_review_redirect_invalid: "El enlace intentó salir del recorrido permitido de Google o devolvió una redirección inválida.",
  google_review_upstream_failed: "Google no pudo preparar el enlace en este momento. Inténtalo nuevamente o pega el enlace directo de reseña.",
  google_review_resolution_timeout: "Google tardó demasiado en responder. Inténtalo nuevamente o pega el enlace directo de reseña.",
};

type GoogleReviewResolutionFailure = {
  status: number;
  backendError?: string;
};

export function formatGoogleReviewResolutionFailure(error: unknown) {
  if (!isGoogleReviewResolutionFailure(error)) {
    return "No fue posible consultar Google por un error de red. Tu formulario se conservó; inténtalo nuevamente.";
  }
  if (error.status === 401 || error.backendError === "unauthorized") {
    return "Tu sesión venció. Ingresa nuevamente antes de preparar el enlace de reseña.";
  }
  if (error.status === 403 || error.backendError === "admin_forbidden") {
    return "Tu cuenta no tiene permiso de administrador para preparar enlaces de reseña.";
  }
  const controlledMessage = error.backendError ? messages[error.backendError] : undefined;
  if (controlledMessage) return controlledMessage;
  return "No fue posible preparar el enlace de reseña. Tu formulario se conservó; inténtalo nuevamente.";
}

function isGoogleReviewResolutionFailure(error: unknown): error is GoogleReviewResolutionFailure {
  return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number";
}
