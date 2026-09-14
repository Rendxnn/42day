import assert from "node:assert/strict";
import test from "node:test";
import { formatDynamicLinkLookupFailure } from "../src/features/admin/dynamicLinkQuickSetupErrors.ts";
import { formatGoogleReviewResolutionFailure } from "../src/features/admin/googleReviewResolutionErrors.ts";

test("quick setup presents controlled lookup messages for safe, actionable recovery", () => {
  assert.match(formatDynamicLinkLookupFailure({ status: 401 }), /sesión venció/);
  assert.match(formatDynamicLinkLookupFailure({ status: 403 }), /permiso de administrador/);
  assert.match(formatDynamicLinkLookupFailure({ status: 404, backendError: "dynamic_link_not_found" }), /No existe una unidad/);
  assert.match(formatDynamicLinkLookupFailure({ status: 400, backendError: "dynamic_link_code_invalid" }), /formato esperado/);
  assert.match(formatDynamicLinkLookupFailure({ status: 429 }), /demasiadas consultas/);
  assert.match(formatDynamicLinkLookupFailure({ status: 502 }), /temporalmente no disponible/);
  assert.match(formatDynamicLinkLookupFailure({ status: 503 }), /temporalmente no disponible/);
  assert.equal(formatDynamicLinkLookupFailure({ status: 418 }), "No fue posible consultar la unidad. Inténtalo otra vez.");
});

test("quick setup presents controlled Google review resolution messages", () => {
  const apiError = (status, code) => ({ status, backendError: code });

  assert.match(formatGoogleReviewResolutionFailure(apiError(400, "google_review_url_invalid")), /enlace HTTPS/);
  assert.match(formatGoogleReviewResolutionFailure(apiError(400, "google_review_url_unsupported")), /usa Compartir/);
  assert.match(formatGoogleReviewResolutionFailure(apiError(422, "google_review_identifier_missing")), /no encontramos la ficha/);
  assert.match(formatGoogleReviewResolutionFailure(apiError(422, "google_review_identifier_ambiguous")), /más de una ficha/);
  assert.match(formatGoogleReviewResolutionFailure(apiError(502, "google_review_redirect_invalid")), /recorrido permitido/);
  assert.match(formatGoogleReviewResolutionFailure(apiError(502, "google_review_upstream_failed")), /Google no pudo/);
  assert.match(formatGoogleReviewResolutionFailure(apiError(504, "google_review_resolution_timeout")), /tardó demasiado/);
  assert.match(formatGoogleReviewResolutionFailure(apiError(401, "unauthorized")), /sesión venció/);
  assert.match(formatGoogleReviewResolutionFailure(apiError(403, "admin_forbidden")), /permiso de administrador/);
  assert.match(formatGoogleReviewResolutionFailure(new TypeError("network")), /formulario se conservó/);
  assert.match(formatGoogleReviewResolutionFailure(apiError(418, "unknown")), /formulario se conservó/);
});
