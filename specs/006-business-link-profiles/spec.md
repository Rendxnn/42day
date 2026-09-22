# Especificación: perfiles ligeros de negocio

**Estado:** preparado para revisión e implementación por fases.

Un perfil canónico puede pertenecer opcionalmente a un tenant restaurante o existir como negocio ligero. Nace en borrador, solo publica enlaces habilitados y usa slug inmutable después de publicar. `system_admin` administra perfiles genéricos; managers conservan edición solo del perfil de su restaurante mediante una fachada compatible. La URL canónica será `/p/:slug`; `/r/:tenantSlug` conservará compatibilidad.

Los enlaces permitidos son carta, reseña Google, Instagram, TikTok, web, WhatsApp, teléfono, Facebook, Maps, encuesta y custom. Deshabilitar un perfil consumido por QRs activos exige suspenderlos atómicamente y auditar cada cambio. No se eliminan columnas legacy durante rollout.

## Gates pendientes

- Backfill de cada restaurante desde su primera sede activa y dual-write legacy.
- API pública, editor y autorización manager/system_admin.
- Validación de formato y confirmación para reseñas Google.
- Tests de publicación, aislamiento y suspensión atómica.
