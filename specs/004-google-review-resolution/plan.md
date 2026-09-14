# Implementation Plan: Preparación de enlaces directos de reseña de Google

**Branch**: `codex/google-review-resolution` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-google-review-resolution/spec.md`

## Summary

La configuración rápida aceptará enlaces compartidos y fichas completas de Google Maps. El dashboard enviará el valor a una ruta administrativa del Worker; un adaptador aislado validará todos los saltos, seguirá redirecciones sin leer HTML, extraerá un feature ID inequívoco y devolverá un enlace directo de reseña. La UI exigirá abrir y confirmar el candidato antes de guardarlo. Las mutaciones administrativas aceptarán únicamente nuevos destinos Google directos, preservando valores legacy no modificados.

No se añaden tablas, migraciones, dependencias de producción, claves de Google ni despliegues de producción.

## Technical Context

**Language/Version**: TypeScript con Node.js para pruebas y Cloudflare Workers para runtime

**Primary Dependencies**: Hono, React, Vite, APIs nativas `URL`, `fetch` y `AbortController`

**Storage**: Supabase/Postgres existente; sin cambios de esquema ni persistencia nueva

**Testing**: `node:test`, typecheck de TypeScript, builds de API/dashboard y validación manual móvil en staging

**Target Platform**: Cloudflare Worker y dashboard web móvil Safari/Chrome

**Project Type**: Monorepo web con API Worker, aplicación React y paquetes compartidos

**Performance Goals**: Resolver en menos de 10 segundos desde la perspectiva del administrador; timeout interno total de 8 segundos

**Constraints**: máximo 2.048 caracteres, 5 saltos, 3 segundos por fetch, sin HTML, sin llamadas a hosts no permitidos, sin mutación parcial

**Scale/Scope**: uso interno de bajo volumen por `system_admin`; no incluye autoservicio ni rate limiting global

## Constitution Check

- **Spec primero**: PASS. `spec.md`, checklist, investigación, contratos y tareas preceden código.
- **Fronteras claras**: PASS. Core clasifica/normaliza; API orquesta red externa y autoriza; dashboard mantiene estado visual; types posee contratos.
- **Seguridad tenant y privilegios**: PASS. Ruta exclusiva de `system_admin`; no hay datos tenant ni acceso directo nuevo.
- **Efectos externos observables**: PASS. El adaptador traduce fallos a códigos estables y registra metadatos sanitizados.
- **Validación runtime**: PASS. El body comienza como `unknown` y se valida antes de usarlo.
- **Pruebas de comportamiento**: PASS. El plan exige core, API y UI, además de smoke real en staging.
- **Producción**: PASS. Esta implementación no despliega ni modifica recursos externos.

La revisión post-diseño mantiene todos los gates en PASS.

## Current-State Evidence

- `packages/core/src/dynamic-links.ts` ya normaliza códigos, infiere tipos y valida destinos HTTPS, pero clasifica cualquier host de Google Maps como `google_review` sin distinguir una ficha de una acción de reseña.
- `apps/api/src/features/dynamic-links/admin-routes.ts` ya protege las rutas con `requireSystemAdmin` y dispone de mutaciones con auditoría/revisión optimista; actualmente guarda el enlace de Maps sin preparación.
- `apps/dashboard/src/features/admin/QuickDynamicLinkSetup.tsx` conserva el formulario móvil y la confirmación de reemplazo activo, pero solo valida HTTPS antes de guardar.
- `apps/dashboard/src/api.ts` centraliza el cliente autenticado y `apps/api/src/lib/observability/logger.ts` provee logging estructurado sanitizado.

## Project Structure

### Documentation

```text
specs/004-google-review-resolution/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/google-review-resolution-api.md
├── checklists/requirements.md
├── checklists/security-ux.md
└── tasks.md
```

### Source Code

```text
packages/types/src/dynamic-links.ts
packages/core/src/dynamic-links.ts
packages/core/test/dynamic-links.test.mjs
apps/api/src/features/dynamic-links/google-review-resolver.ts
apps/api/src/features/dynamic-links/admin-routes.ts
apps/api/src/features/dynamic-links/service.ts
apps/api/test/dynamic-links.test.mjs
apps/dashboard/src/api.ts
apps/dashboard/src/features/admin/QuickDynamicLinkSetup.tsx
apps/dashboard/src/features/admin/googleReviewPreparation.ts
apps/dashboard/src/features/admin/googleReviewResolutionErrors.ts
apps/dashboard/test/dynamic-link-quick-setup.test.mjs
apps/dashboard/test/dynamic-link-quick-setup-behavior.test.mjs
apps/dashboard/test/dynamic-link-quick-setup-errors.test.mjs
docs/current-status.md
```

**Structure Decision**: Se amplía el feature existente de enlaces dinámicos. El adaptador externo vive en la API; las reglas puras y contratos siguen sus paquetes dueños; React no interpreta feature IDs ni decide seguridad de URLs.

## Design Decisions

### URL classification

`classifyGoogleReviewUrl(value)` devuelve una unión discriminada: `maps_short_link`, `maps_business_url`, `direct_review_url` o `unsupported`. Una URL Google genérica no se convierte en sitio web dentro de este subflujo.

### Feature ID extraction

Se recolectan candidatos desde `ftid` y tokens `!1s`. Cada candidato debe cumplir `0x[0-9a-f]{1,32}:0x[0-9a-f]{1,32}` sin distinguir mayúsculas. Cero candidatos produce `identifier_missing`; más de un valor único produce `identifier_ambiguous`. Un único valor se normaliza a minúsculas y genera `https://www.google.com/maps/place//data=!4m3!3m2!1s<ID>!12e1`.

### Redirect adapter

- `fetch` inyectable, `redirect: "manual"`, método `GET` y sin headers provenientes del cliente.
- Lista inicial y lista de salto centralizadas; toda URL se revalida antes de consultar.
- Máximo 5 respuestas redirect y 8 segundos totales, con máximo 3 segundos por fetch.
- Se resuelven `Location` relativos; se detectan URLs visitadas; se cancela el body sin leerlo.
- Se detiene al encontrar enlace directo o feature ID, evitando consultar la ficha final.
- Fallos tienen una clase tipada con código y estado HTTP; las rutas no inspeccionan mensajes de excepciones.

### Write invariant and legacy compatibility

`validateAdminDestination` envuelve la validación pública existente y recibe el destino actual opcional.
Cuando el nuevo tipo sea `google_review`, solo acepta una URL clasificada como directa. La misma URL
legacy existente se permite para actualizaciones ajenas al destino; un valor nuevo short/business se
rechaza con `dynamic_link_google_review_resolution_required`. La regla se aplica a quick
configuration y al editor general, mientras `validateDestination` permanece compatible con las
redirecciones públicas legacy.

### UI state

El estado `GoogleReviewPreparationState` es independiente de la fase general del modal. La huella es el texto exacto normalizado que se preparó. Editar el campo vuelve a `idle`. Abrir el candidato marca `previewOpened`; solo entonces aparecen las acciones afirmativa/negativa. Confirmar sustituye el valor enviado, no el texto mostrado como origen. No se genera token de confirmación porque solo un administrador interno puede mutar y el servidor ya valida el formato autoritativo.

## Failure, Concurrency and Idempotency

- Resolver es read-only y repetible; no necesita request ID.
- Guardar conserva revisión optimista y auditoría existentes.
- Un error de Google ocurre antes de cualquier mutación.
- Un conflicto `dynamic_link_stale` obliga a recargar como hoy.
- El timeout aborta el fetch activo; todos los códigos de error tienen copy controlado.
- Los logs incluyen resultado, host inicial, cantidad de saltos y duración; excluyen URL, ID y body.

## Rollout and Rollback

1. Verificación local determinista con fetch falso.
2. Build y suites completas.
3. Commit de artefactos/código verificado.
4. Staging solo con autorización explícita posterior y matriz real de Google.
5. Producción únicamente con una autorización explícita que nombre ambiente y cambio.

Rollback no requiere datos: se retira la interacción/endpoint, se mantiene pegado de enlace directo y no se alteran destinos canónicos ya guardados.

## Requirement-to-Test Traceability

| Requisitos | Evidencia automatizada | Evidencia manual |
| --- | --- | --- |
| FR-001, FR-002, FR-008-FR-010 | core classification/extraction/building | URLs reales de negocio y dirección |
| FR-003-FR-007, FR-019, FR-020, FR-022 | API resolver tests con fetch falso | logs de staging sanitizados |
| FR-014-FR-017, FR-021, FR-023 | API mutation regression tests | redirección QR/NFC existente |
| FR-011-FR-013, FR-018, FR-024 | dashboard behavior tests | Safari/Chrome móvil a 320 px |

## Complexity Tracking

No hay violaciones constitucionales ni tecnología adicional que justificar.
