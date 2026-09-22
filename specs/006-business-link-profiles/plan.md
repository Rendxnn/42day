# Plan

La migración crea `control.business_profiles`, `control.business_profile_links` y la relación opcional desde Dynamic Links. Todas conservan RLS forzado y acceso backend con service role. La implementación API y UI se mantiene separada del rollout de datos para evitar publicar un perfil incompleto.
