export const BUSINESS_PROFILE_LIMITS = {
  displayName: 160,
  headline: 180,
  locationName: 160,
  address: 500,
  slug: 80,
  linkLabel: 120,
  linkHref: 2048,
  maxLinks: 30,
  phoneDigitsMin: 7,
  phoneDigitsMax: 15,
} as const;

export const BUSINESS_PROFILE_ERROR_MESSAGES: Record<string, string> = {
  business_profile_request_invalid: "La solicitud del perfil no es válida. Recarga la página e inténtalo de nuevo.",
  business_profile_display_name_invalid: "Escribe el nombre del negocio (entre 1 y 160 caracteres).",
  business_profile_slug_invalid: "El identificador público solo puede usar letras minúsculas, números y guiones.",
  business_profile_slug_conflict: "Ese identificador público ya está en uso. Usa otro nombre.",
  business_profile_tenant_invalid: "El negocio seleccionado no está disponible para esta operación.",
  business_profile_revision_invalid: "La versión del perfil no es válida. Recarga el perfil e inténtalo de nuevo.",
  business_profile_links_invalid: "Puedes configurar hasta 30 enlaces en un perfil.",
  business_profile_link_kind_invalid: "El tipo de enlace seleccionado no es válido.",
  business_profile_link_label_invalid: "La etiqueta del enlace debe tener entre 1 y 120 caracteres.",
  business_profile_link_enabled_invalid: "No se pudo interpretar el estado del enlace. Inténtalo de nuevo.",
  business_profile_link_order_invalid: "El orden de los enlaces no es válido.",
  business_profile_link_href_invalid: "Usa una URL HTTPS pública válida, sin usuario, contraseña ni dirección local.",
  business_profile_phone_invalid: "Escribe un teléfono de 7 a 15 dígitos. Puedes usar +, espacios, paréntesis y guiones; no agregues extensiones.",
  business_profile_instagram_invalid: "El enlace debe pertenecer a Instagram (instagram.com).",
  business_profile_tiktok_invalid: "El enlace debe pertenecer a TikTok (tiktok.com).",
  business_profile_facebook_invalid: "El enlace debe pertenecer a Facebook (facebook.com).",
  business_profile_google_review_unprepared: "Prepara y confirma el enlace de reseñas de Google antes de guardarlo.",
  business_profile_text_invalid: "Revisa el texto del perfil y sus límites antes de guardar.",
  business_profile_not_found: "No encontramos ese perfil. Actualiza la lista e inténtalo de nuevo.",
  business_profile_not_published: "El perfil debe estar publicado antes de asignarlo a un QR.",
  business_profile_disabled: "El perfil está deshabilitado y no puede modificarse.",
  business_profile_invalid: "Revisa los datos del perfil e inténtalo de nuevo.",
  business_profile_database_error: "No se pudo guardar el perfil. Inténtalo de nuevo en unos segundos.",
  business_profile_operation_failed: "No se pudo completar la operación del perfil. Revisa los datos e inténtalo de nuevo.",
  dynamic_link_stale: "Esta unidad cambió en otra sesión. Vuelve a escanearla antes de guardar.",
  dynamic_link_archived: "La unidad fue archivada y no puede modificarse.",
  dynamic_link_google_review_resolution_required: "Prepara y confirma el enlace de reseñas de Google antes de guardar.",
  dynamic_link_not_found: "No encontramos esa unidad QR.",
  dynamic_link_invalid: "No se pudo guardar la configuración. Revisa los datos e inténtalo de nuevo.",
  nfc_handoff_invalid: "La sesión de NFC expiró o ya fue utilizada. Inicia una nueva.",
};

export function businessProfileErrorMessage(code: string | undefined, fallback = "No se pudo completar la operación.") {
  if (!code) return fallback;
  return BUSINESS_PROFILE_ERROR_MESSAGES[code] ?? fallback;
}
