# Contrato API: perfiles ligeros de negocio

Todas las rutas administrativas exigen sesión autenticada. El backend verifica `system_admin` o el
`encargado` del tenant antes de acceder a datos. Los errores usan `{ "error": "codigo_estable" }`.

## Administración global

### `POST /dashboard/admin/business-profiles`

Entrada: `requestId` UUID, `displayName`, opcionalmente `slug`, `tenantId`, contenido básico y enlaces
iniciales. Crea un perfil `draft`; repetir el mismo `requestId` con el mismo comando devuelve el resultado
anterior y reutilizarlo con otro comando devuelve `409 business_profile_idempotency_conflict`.

### `GET /dashboard/admin/business-profiles/:id`

Devuelve el perfil completo, sus enlaces —incluidos deshabilitados— y el conteo de QRs activos que lo
consumen. No devuelve secretos ni auditorías completas.

### `PATCH /dashboard/admin/business-profiles/:id`

Exige `revision` y aplica una actualización total de enlaces. Respuestas: `200`, `400` para entrada
inválida, `404`, `409 business_profile_stale` o `409 business_profile_slug_conflict`.

### `POST /dashboard/admin/business-profiles/:id/publish`

Exige revisión actual. Publica solo una configuración válida y devuelve URL pública derivada.

### `POST /dashboard/admin/business-profiles/:id/disable-and-suspend`

Exige revisión. Si hay QRs activos, suspende todas las unidades elegibles y escribe auditoría individual
en una sola transacción; si una falla, no cambia ninguna. Devuelve perfil deshabilitado y conteos.

## Compatibilidad de restaurantes

`GET|PATCH /dashboard/:tenantSlug/settings/public-profile` conserva su forma actual, pero lee/escribe el
perfil canónico y las columnas legacy. Solo `encargado` del tenant puede usarla.

## Lectura pública

### `GET /dashboard/public/business-profiles/:slug`

Devuelve únicamente perfil `published` y enlaces con `enabled = true`, en orden estable. Borrador y
deshabilitado devuelven `404 business_profile_not_found` indistinguible para el visitante.

La página `/p/:profileSlug` consume este contrato. `/r/:tenantSlug` mantiene la ruta compatible de
restaurante durante el rollout.
