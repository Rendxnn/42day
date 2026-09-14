# Tasks: Preparación de enlaces directos de reseña de Google

**Input**: Approved artifacts from `/specs/004-google-review-resolution/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` y checklists completos

**Tests**: Obligatorias para cada requisito funcional y regresión.

## Phase 1: Setup and Characterization

**Purpose**: Confirmar baseline y preparar contratos sin cambiar comportamiento.

- [x] T001 Verificar el estado limpio, rutas actuales y baseline de `packages/core/test/dynamic-links.test.mjs`, `apps/api/test/dynamic-links.test.mjs` y `apps/dashboard/test/dynamic-link-quick-setup*.test.mjs`
- [x] T002 [P] Añadir contratos compartidos de resolución a `packages/types/src/dynamic-links.ts` y `packages/types/src/index.ts` para FR-001, FR-002 y FR-022
- [x] T003 Validar que no se requieren dependencias, bindings, migraciones ni cambios de ignore files según `specs/004-google-review-resolution/plan.md`

**Verification**: Baseline focalizado verde antes de introducir pruebas nuevas.

---

## Phase 2: Foundational URL Domain

**Purpose**: Implementar clasificación, extracción y construcción puras compartidas.

- [x] T004 [P] Escribir pruebas fallidas de clasificación, seguridad, extracción inequívoca y construcción en `packages/core/test/dynamic-links.test.mjs` para FR-002, FR-004, FR-005 y FR-008-FR-010
- [x] T005 Implementar clasificación Google, extracción de feature ID y URL directa en `packages/core/src/dynamic-links.ts` y `packages/core/src/index.ts` para FR-002, FR-008-FR-010 y FR-022
- [x] T006 Ejecutar pruebas de core y typecheck de `@42day/core` y `@42day/types`

**Checkpoint**: Reglas puras verificadas y listas para API/UI.

---

## Phase 3: User Story 1 - Preparar y confirmar desde móvil (Priority: P1)

**Goal**: Resolver un enlace Maps, probar el candidato y guardar únicamente el destino confirmado.

**Independent Test**: Short/business/direct → resolver → abrir → confirmar → guardar; `publicUrl` no cambia.

- [x] T007 [P] [US1] Escribir pruebas API fallidas del contrato y resolución exitosa en `apps/api/test/dynamic-links.test.mjs` para FR-001-FR-003, FR-006-FR-010 y FR-022
- [x] T008 [US1] Implementar el adaptador reemplazable en `apps/api/src/features/dynamic-links/google-review-resolver.ts` para FR-001, FR-006-FR-010 y FR-022
- [x] T009 [US1] Añadir la ruta protegida antes de rutas genéricas en `apps/api/src/features/dynamic-links/admin-routes.ts` para FR-001-FR-003
- [x] T010 [P] [US1] Añadir cliente HTTP de resolución en `apps/dashboard/src/api.ts` para FR-001 y FR-022
- [x] T011 [P] [US1] Escribir pruebas UI fallidas del estado preparación/preview/confirmación en `apps/dashboard/test/dynamic-link-quick-setup-behavior.test.mjs` para FR-011-FR-014 y FR-021
- [x] T012 [US1] Implementar el subflujo Google en `apps/dashboard/src/features/admin/QuickDynamicLinkSetup.tsx` para FR-011-FR-014, FR-021 y FR-023-FR-024
- [x] T013 [US1] Ejecutar pruebas focalizadas de API/dashboard, typecheck y builds afectados

**Checkpoint**: P1 funcional y comprobable con red falsa determinista.

---

## Phase 4: User Story 2 - Fallo seguro y recuperable (Priority: P2)

**Goal**: Contener SSRF, timeout, ambigüedad y fallos externos sin mutar ni perder el formulario.

**Independent Test**: Cada error definido devuelve código/copy propio y no provoca escritura.

- [x] T014 [P] [US2] Ampliar pruebas API con host externo, HTTP, credenciales, puerto, `Location` relativo, loop, saltos, timeout y upstream en `apps/api/test/dynamic-links.test.mjs` para FR-004-FR-007, FR-010, FR-018-FR-020
- [x] T015 [US2] Completar controles SSRF, presupuesto de red, cancelación de body y logs sanitizados en `apps/api/src/features/dynamic-links/google-review-resolver.ts` y `admin-routes.ts` para FR-004-FR-007 y FR-019-FR-020
- [x] T016 [P] [US2] Crear mapeo de errores en `apps/dashboard/src/features/admin/googleReviewResolutionErrors.ts` para FR-018-FR-019
- [x] T017 [P] [US2] Añadir pruebas UI de error, reintento, rechazo, popup bloqueado e invalidación en `apps/dashboard/test/dynamic-link-quick-setup-behavior.test.mjs` para FR-013, FR-018-FR-019 y FR-024
- [x] T018 [US2] Integrar recuperación sin pérdida de formulario en `apps/dashboard/src/features/admin/QuickDynamicLinkSetup.tsx` para FR-013, FR-018-FR-019 y FR-024
- [x] T019 [US2] Ejecutar pruebas focalizadas, typecheck y builds afectados

**Checkpoint**: Fallos de red/seguridad quedan cerrados, observables y recuperables.

---

## Phase 5: User Story 3 - Compatibilidad e invariante de escritura (Priority: P3)

**Goal**: Evitar nuevos destinos Maps incompletos sin romper legacy ni destinos no Google.

**Independent Test**: Ambos PATCH rechazan nuevos short/business; conservar legacy y otros destinos sigue funcionando.

- [x] T020 [P] [US3] Escribir pruebas API fallidas del invariante, legacy sin cambios y regresiones no Google en `apps/api/test/dynamic-links.test.mjs` para FR-014-FR-017 y FR-021
- [x] T021 [US3] Centralizar validación Google directa y compatibilidad legacy en `apps/api/src/features/dynamic-links/service.ts` para FR-014-FR-017
- [x] T022 [US3] Aplicar el invariante a quick configuration y editor general en `apps/api/src/features/dynamic-links/admin-routes.ts` para FR-014-FR-017
- [x] T023 [P] [US3] Añadir regresiones UI para enlace directo y destinos no Google en `apps/dashboard/test/dynamic-link-quick-setup-behavior.test.mjs` para FR-002, FR-016-FR-017
- [x] T024 [US3] Ejecutar suites completas de dynamic links, typecheck y builds afectados

**Checkpoint**: Compatibilidad e invariante verificados sin migración.

---

## Phase 6: Documentation and Cross-Cutting Verification

- [x] T025 Actualizar `docs/current-status.md` con comportamiento implementado, riesgo de formato y fallback para FR-022
- [x] T026 Validar trazabilidad FR/SC contra tests y registrar evidencia en `specs/004-google-review-resolution/quickstart.md`
- [x] T027 Ejecutar `pnpm test` y registrar cualquier bloqueo real sin sustituirlo por fakes
- [x] T028 Ejecutar `pnpm typecheck` y `pnpm build`
- [x] T029 Revisar diff contra `CODESTYLE.md`, secretos, aislamiento, compatibilidad y trabajo no relacionado
- [x] T030 Verificar que no se creó migración, binding, dependencia o acción de producción fuera del alcance

**Checkpoint**: Artefactos, código y evidencia listos para convergencia y commit final.

---

## Phase 7: External Release Gates

Estas tareas no están autorizadas por una solicitud de implementación local y permanecen abiertas de
forma explícita.

- [ ] T031 Con autorización explícita de staging, ejecutar la matriz real de Android/iPhone, URL del usuario, tres fichas adicionales, dirección y enlace manipulado; registrar SC-001 y SC-006 en `quickstart.md`
- [ ] T032 Tras aprobar T031 y recibir autorización explícita separada para producción, desplegar Worker y dashboard en ese orden, ejecutar canario y observar logs sanitizados

## Phase 8: Observed Google Root-query Redirect

- [x] T033 Documentar el redirect real `maps.google.com/?q=...&ftid=...` y su frontera cerrada en SPEC y plan antes de modificar código
- [x] T034 Añadir regresiones que reproduzcan el `Location` real, acepten un `ftid` válido y rechacen ruta raíz sin ID, ID malformado o host parecido
- [x] T035 Ajustar la clasificación pura sin ampliar la allowlist de hosts ni efectuar un segundo fetch
- [x] T036 Ejecutar pruebas focalizadas con fake determinista y una comprobación local opt-in contra el enlace real; registrar evidencia sin URL completa ni feature ID en logs
- [x] T037 Ejecutar test, typecheck y build completos, actualizar estado/quickstart y crear commit local; no desplegar

## Dependencies and Execution Order

- Phase 1 precede contratos y baseline.
- Phase 2 bloquea el resolver y la UI.
- US1 implementa el camino feliz; US2 endurece la misma frontera; US3 aplica la regla de persistencia.
- Cada fase escribe pruebas antes del comportamiento y termina con verificación.
- Staging y producción no forman parte de estas tareas locales.

## Completion Rules

- No marcar una prueba bloqueada como exitosa.
- No desplegar ni usar recursos de producción.
- Cada checkpoint significativo termina en commit Conventional enfocado.
- El feature termina solo cuando `$speckit-converge` no encuentre brechas.
