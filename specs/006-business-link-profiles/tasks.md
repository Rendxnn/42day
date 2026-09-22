# Tareas: perfiles ligeros de negocio

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md) y [contrato API](./contracts/business-profiles-api.md).

**Tests**: requeridos por la constitución y por los criterios de aceptación del feature.

## Fase 1: Preparación y contratos

- [x] T001 Revisar la migración histórica aplicada y crear una migración forward con `supabase migration new complete_business_link_profiles` antes de editar SQL en `supabase/migrations/`.
- [x] T002 [P] Añadir contratos públicos de perfil, enlaces, requests, errores y destino QR en `packages/types/src/business-profiles.ts` y `packages/types/src/index.ts`.
- [x] T003 [P] Añadir reglas puras de validación y normalización de enlaces en `packages/core/src/business-profile-links.ts` y sus exports.
- [x] T004 Añadir pruebas unitarias de tipos de enlace, slug y normalización en `packages/core/test/business-profile-links.test.mjs`.

## Fase 2: Fundaciones de datos y autorización

**Propósito**: completar el modelo aplicado provisionalmente antes de exponer cualquier endpoint.

- [x] T005 Crear migración forward con `creation_request_id`, restricciones de enlaces estándar, índices, RLS, grants y funciones `security invoker` en `supabase/migrations/*_complete_business_link_profiles.sql`.
- [x] T006 Crear backfill idempotente y dual-write transaccional de sedes legacy dentro de la migración de `supabase/migrations/*_complete_business_link_profiles.sql`.
- [x] T007 Crear RPC atómica para publicar, actualizar y deshabilitar/suspender perfiles con locks ordenados y auditoría individual en `supabase/migrations/*_complete_business_link_profiles.sql`.
- [x] T008 Crear pruebas SQL de grants, RLS, backfill, revisión stale y todo-o-nada en `supabase/tests/business-link-profiles.sql` (la matriz stale/RLS independiente sigue siendo gate).
- [x] T009 Añadir repositorio y servicio de perfiles con mapeo de filas, errores estables y URL derivada en `apps/api/src/features/public-profile/business-profile-{repository,service,validation}.ts`.
- [x] T010 Añadir autorización de perfil vinculado para `encargado` y resolver de tenant para `system_admin` en `apps/api/src/features/public-profile/business-profile-service.ts` (rutas admin y fachada de settings).

**Checkpoint**: migración local, RLS y autorización listos; no se publica UI hasta que T005–T010 pasen.

## Fase 3: US1 — Perfil ligero administrado (P1)

**Objetivo**: un administrador crea, edita y publica un perfil genérico con enlaces activables.

**Prueba independiente**: crear borrador, guardar enlaces deshabilitados, publicar y comprobar que la
proyección pública contiene solo los enlaces habilitados.

- [x] T011 [P] [US1] Añadir pruebas API de creación idempotente, slug, validación de enlaces, publicación y revisión stale en `apps/api/test/business-profiles.test.mjs` (27 pruebas API pasan).
- [x] T012 [US1] Completar rutas `POST|GET|PATCH|POST publish` en `apps/api/src/features/public-profile/business-profile-routes.ts`.
- [x] T013 [US1] Añadir cliente tipado de perfiles y errores en `apps/dashboard/src/api.ts`.
- [x] T014 [US1] Crear editor administrativo de perfil ligero con visibilidad y orden de enlaces en `apps/dashboard/src/features/admin/BusinessProfileEditor.tsx`.
- [x] T015 [US1] Integrar editor administrativo con QR/NFC sin consultas directas a Supabase en `apps/dashboard/src/App.tsx` y `apps/dashboard/src/features/admin/DynamicLinksSection.tsx`.
- [x] T016 [US1] Añadir prueba de comportamiento del editor y estados de borrador/publicación en `apps/dashboard/test/business-profiles.test.mjs`.

## Fase 4: US2 — Compatibilidad de restaurante (P1)

**Objetivo**: los encargados conservan su configuración y URL pública mientras se usa el perfil canónico.

**Prueba independiente**: un encargado autorizado edita su perfil; el perfil canónico y valores legacy
coinciden, mientras un encargado ajeno recibe `forbidden`.

- [ ] T017 [P] [US2] Añadir pruebas API de backfill, dual-write, autorización de encargado y compatibilidad de alias en `apps/api/test/business-profiles.test.mjs` (la ruta está implementada; falta evidencia automatizada de manager y backfill real).
- [x] T018 [US2] Delegar `GET|PATCH /settings/public-profile` al servicio canónico en `apps/api/src/features/dashboard/routes/settings.ts`.
- [x] T019 [US2] Adaptar el editor existente a contrato canónico sin romper la fachada en `apps/dashboard/src/features/configuration/RestaurantPublicProfileSection.tsx` (la fachada mantiene el contrato y el API proyecta el modelo canónico).
- [x] T020 [US2] Añadir proyección y ruta React `/p/:profileSlug`, conservando `/r/:tenantSlug`, en `apps/dashboard/src/App.tsx` y `apps/dashboard/src/features/public-profile/BusinessProfilePage.tsx`.
- [ ] T021 [US2] Añadir pruebas UI de alias, perfil de restaurante y prohibición de tenant cruzado en `apps/dashboard/test/business-profiles.test.mjs` (el test actual cubre rutas y editor genérico, no aislamiento de tenant).

## Fase 5: US3 — Destino QR de perfil (P1)

**Objetivo**: un QR individual puede apuntar a un perfil publicado sin que el cliente construya la URL.

**Prueba independiente**: asignar un perfil con tenant y uno genérico a una unidad; confirmar URL derivada,
asociación correcta y conservación de URL permanente.

- [x] T022 [P] [US3] Añadir pruebas API de `destinationType: profile`, perfil borrador/deshabilitado y asociación tenant en `apps/api/test/business-profiles.test.mjs` (la prueba de frontera cubre URL derivada y perfil publicado).
- [x] T023 [US3] Extender servicio/rutas de Dynamic Links para validar perfil y derivar destino en `apps/api/src/features/dynamic-links/{admin-routes,service,repository}.ts`.
- [x] T024 [US3] Añadir selector de perfil y advertencias de destino en `apps/dashboard/src/features/admin/DynamicLinksSection.tsx`.

## Fase 6: US4 — Deshabilitación segura (P1)

**Objetivo**: deshabilitar un perfil sin dejar QR activos apuntando a una página inaccesible.

**Prueba independiente**: una unidad stale o archivada aborta la operación; una operación válida suspende
todas las activas, conserva URL permanente y deja auditoría por unidad.

- [ ] T025 [P] [US4] Añadir pruebas de operación atómica, auditoría y reintento en `apps/api/test/business-profiles.test.mjs` y `supabase/tests/business-link-profiles.sql` (la prueba local cubre suspensión/auditoría/conteo; faltan stale y reintento idempotente como evidencia separada).
- [x] T026 [US4] Completar endpoint `disable-and-suspend` y respuestas de preflight en `apps/api/src/features/public-profile/business-profile-routes.ts`.
- [x] T027 [US4] Añadir confirmación de impacto, conteo de QRs y estado deshabilitado en `apps/dashboard/src/features/admin/BusinessProfileEditor.tsx`.

## Fase 7: Documentación, verificación y convergencia

- [x] T028 Actualizar `PROJECT_CONTEXT.md`, `README.md`, `ARCHITECTURE.md`, documentación de API/dashboard y `docs/flows/presence-digital.md` con el estado implementado.
- [x] T029 Actualizar `docs/architecture/{backend,dashboard-frontend,database-migrations,tenant-onboarding}.md`, `docs/integrations/supabase.md` y `docs/runbooks/smoke-tests.md`.
- [ ] T030 Ejecutar pruebas focalizadas, Supabase local, typecheck/build de workspaces y gates raíz; documentar bloqueos reales en `specs/006-business-link-profiles/quickstart.md` (focalizadas, migración, typecheck y build dashboard pasan; `turbo run build` queda bloqueado por la verificación de firma de pnpm 9.15.0 del entorno).
- [ ] T031 Solicitar y registrar revisión independiente de `specs/006-business-link-profiles/checklists/requirements.md` antes de promover el feature.
- [ ] T032 Ejecutar `speckit-converge`, implementar cualquier tarea añadida y actualizar `docs/current-status.md`.

## Fase 8: integración de configuración rápida

- [x] T033 [US3] Permitir crear o seleccionar un perfil publicado desde configuración rápida y asignarlo atómicamente al QR.
- [x] T034 [US3] Añadir pruebas API de creación idempotente de perfil desde QR y conflicto de revisión.
- [x] T035 Actualizar quickstart y estado actual con el flujo real de configuración rápida.

## Dependencias y estrategia

- T001–T010 bloquean todos los recorridos de usuario.
- US1 permite publicar perfiles genéricos; US2 añade compatibilidad; US3 depende de US1; US4 depende de
  US1 y la base transaccional.
- La primera entrega verificable es T001–T016. No se aplican migraciones ni se despliega staging sin una
  autorización explícita para ese momento.
