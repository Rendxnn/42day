# Plan de implementación: perfiles ligeros de negocio

**Feature**: `006-business-link-profiles` | **Fecha**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

## Resumen

Convertir el perfil público de restaurantes en una fachada compatible sobre un perfil canónico y añadir
perfiles genéricos internos. El backend será dueño de validación, autorización, URL derivada, compatibilidad
legacy y transacciones de suspensión; React consume contratos compartidos.

## Contexto técnico

**Lenguaje/plataformas**: TypeScript, Cloudflare Workers/Hono, React/Vite y PostgreSQL/Supabase.
**Dependencias**: `@42day/types`, `@42day/core`, REST interno de Supabase y el resolver existente de reseñas Google.
**Persistencia**: `control.business_profiles`, `control.business_profile_links`, `control.dynamic_link_units`
y auditoría existente.
**Pruebas**: `node:test` actual para API/dashboard, Supabase local para RPC/RLS/atomicidad y smoke en staging.
**Alcance**: perfiles internos, fachada de restaurante, lectura pública y destino QR individual; lote y NFC son
features posteriores.

## Decisiones de arquitectura

1. `features/public-profile` será dueño de reglas, repositorio y rutas de perfiles canónicos. Las rutas
   actuales de settings delegarán allí como fachada temporal; no se añade lógica a módulos legacy.
2. Los contratos públicos (`BusinessProfile`, enlaces, requests y errores) se consolidan en
   `packages/types`. Validadores puros de URL/normalización viven en `packages/core` o en el feature
   propietario cuando dependan del resolver de Google.
3. La migración ya aplicada `20260922010509_business_link_profiles.sql` es historia inmutable. Las
   correcciones se harán en una migración nueva creada mediante `supabase migration new`, nunca editando
   la aplicada.
4. La migración forward completa `creation_request_id`, índices, restricciones de enlaces estándar,
   backfill idempotente y RPCs
   con búsqueda calificada, locks cortos y orden estable. RLS seguirá forzado y `anon`/`authenticated`
   no tendrán grants; solo el Worker usa `service_role`.
5. Para mantener dual-write de restaurante en una sola transacción, una RPC de `control` actualizará el
   perfil canónico y la sede activa del schema tenant mediante SQL dinámico schema-calificado. El endpoint
   autoriza primero al actor y pasa IDs/valores validados; no acepta schema desde el cliente.
6. La operación `disable-and-suspend` bloquea el perfil y sus QRs por orden de `id`, verifica estados y
   revisiones, cambia todos o ninguno e inserta auditoría `suspended` individual con metadata mínima.
7. El resolver público consulta únicamente perfiles publicados y enlaces habilitados. La ruta React
   `/p/:profileSlug` usa ese contrato; `/r/:tenantSlug` queda como alias del restaurante hasta un rollout
   posterior que retire las columnas legacy.

## Seguridad, concurrencia y rollout

- El Worker autentica `system_admin` o la membresía `encargado` antes de cualquier mutación. No se
  autorizan decisiones usando `user_metadata`.
- Los cuerpos se validan como `unknown`; conflictos de revisión devuelven un código estable sin
  reintento automático.
- Las nuevas funciones serán `security invoker`, con `search_path` vacío y `EXECUTE` revocado de
  `public`, `anon` y `authenticated`; no se usarán funciones `security definer` para atajar permisos.
- El backfill es insert-only/idempotente, se ejecuta antes de activar la fachada y permite rollback de
  código porque las columnas legacy permanecen escritas.
- Primero se prueban migraciones, RLS y rollback en Supabase local; luego se autoriza aplicar y validar
  staging. Producción queda fuera de este feature hasta autorización explícita separada.

## Estructura prevista

```text
packages/types/src/business-profiles.ts
packages/core/src/business-profile-links.ts
apps/api/src/features/public-profile/
├── business-profile-routes.ts
├── business-profile-service.ts
├── business-profile-repository.ts
└── business-profile-validation.ts
apps/api/src/features/dashboard/routes/settings.ts
apps/api/test/business-profiles.test.mjs
apps/dashboard/src/
├── api.ts
├── App.tsx
├── features/public-profile/BusinessProfilePage.tsx
└── features/configuration/RestaurantPublicProfileSection.tsx
apps/dashboard/test/business-profiles.test.mjs
supabase/migrations/*_complete_business_link_profiles.sql
supabase/tests/business-link-profiles.sql
```

## Trazabilidad

| Requisito | Evidencia planificada |
| --- | --- |
| FR-001–004, FR-010 | pruebas de validación, contratos y revisión optimista API |
| FR-005–006 | pruebas de lectura pública y rutas React |
| FR-007 | pruebas API de administración, manager ajeno y perfil genérico |
| FR-008 | prueba de backfill/dual-write en Supabase local |
| FR-009 | pruebas de actualización de Dynamic Link y URL derivada por backend |
| FR-011 | prueba RPC atómica, auditoría y conflicto stale |
| FR-012 | typecheck y prueba de capa API del dashboard |

## Constitution Check

Cumple con especificación previa, contratos en `packages/types`, acceso de negocio solo por backend,
migraciones canónicas y pruebas de comportamiento. No hay excepciones. La implementación se bloquea hasta
que el checklist sea revisado por una persona distinta y `speckit-analyze` no tenga hallazgos críticos.
