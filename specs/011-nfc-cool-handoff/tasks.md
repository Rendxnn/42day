# Tareas: handoff NFC.cool en iPhone

**Entrada**: Artefactos de diseño en `specs/011-nfc-cool-handoff/`.

**Prerrequisitos**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/nfc-cool-handoff-api.md`, `quickstart.md`.

## Phase 1: Preparación y contrato compartido

**Propósito**: Fijar el proveedor activo y la respuesta API sin persistencia nueva.

- [x] T001 Actualizar el contrato discriminado de handoff NFC.cool y conservar los tipos de consumo legado en `packages/types/src/dynamic-links.ts`.
- [x] T002 [P] Añadir pruebas de contrato del handoff activo, URL permanente codificada, ausencia de token/sesión y rechazo de archivadas en `apps/api/test/dynamic-links-bulk-nfc.test.mjs`.
- [x] T003 [P] Añadir pruebas de UI que exijan NFC.cool activo, fallback manual, guía de Atajos y ausencia del CTA NFC Helper en `apps/dashboard/test/bulk-nfc-setup.test.mjs`.

**Checkpoint**: Las expectativas nuevas fallan contra el proveedor NFC Helper actual.

---

## Phase 2: Fundamento del adaptador

**Propósito**: Aislar la integración externa de la ruta y deshabilitar NFC Helper de forma explícita.

- [x] T004 Crear el adaptador puro NFC.cool activo y el constructor NFC Helper legado no seleccionable en `apps/api/src/features/dynamic-links/nfc-handoff.ts`.
- [x] T005 Actualizar `POST /admin/dynamic-links/:id/nfc-handoff` para delegar al adaptador activo, no crear sesión para NFC.cool y preservar únicamente el consumo de callbacks legado en `apps/api/src/features/dynamic-links/admin-routes.ts`.
- [x] T006 Ejecutar la suite focalizada de API para validar T001-T005 con `pnpm --filter @42day/api test` (la firma de Corepack bloqueó `pnpm`; la suite equivalente se ejecutó directamente con Node: 5/5).

**Checkpoint**: El endpoint devuelve solo el handoff NFC.cool y ninguna mutación/sesión nueva.

---

## Phase 3: User Story 1 - Programar con NFC.cool (Priority: P1) 🎯 MVP

**Goal**: Abrir el Atajo `Escribir NFC ParaHoy` con la URL permanente de una unidad elegible.

**Independent Test**: Desde configuración rápida, la acción visible solicita el enlace autorizado y abre `shortcuts://` con la URL permanente como entrada.

- [x] T007 [US1] Sustituir la acción NFC Helper por NFC.cool y eliminar el almacenamiento de sesión nuevo en `apps/dashboard/src/features/admin/QuickDynamicLinkSetup.tsx`.
- [x] T008 [US1] Mantener `Copiar enlace para NFC`, añadir enlace de instalación de NFC.cool y guía visible de configuración de Atajos en `apps/dashboard/src/features/admin/QuickDynamicLinkSetup.tsx`.
- [x] T009 [US1] Ejecutar la suite focalizada del dashboard para validar T003, T007 y T008 con `pnpm --filter @42day/dashboard test` (la firma de Corepack bloqueó `pnpm`; la suite equivalente se ejecutó directamente con Node: 2/2).

**Checkpoint**: El administrador ve un único proveedor activo, puede iniciar Atajos o copiar el mismo enlace permanente.

---

## Phase 4: User Story 2 - Conservar operación segura (Priority: P1)

**Goal**: Evitar hitos NFC falsos y preservar únicamente callbacks legado ya existentes.

**Independent Test**: Iniciar/cancelar NFC.cool no persiste una sesión, UID ni hito; el listener de callback queda etiquetado como legado y no inicia NFC Helper.

- [x] T010 [US2] Aislar y renombrar el mensaje del listener de callback NFC Helper previo en `apps/dashboard/src/features/admin/DynamicLinksSection.tsx` sin introducir nuevos lanzamientos del proveedor legado.
- [x] T011 [US2] Ejecutar las suites API/dashboard focalizadas después de T010 y validar que no se modifica ningún hito NFC por el handoff (API 5/5; dashboard 2/2).

**Checkpoint**: La operación activa no tiene callback ni estado automático; cualquier callback previo sigue siendo seguro y de único uso.

---

## Phase 5: User Story 3 - Preparar el iPhone una sola vez (Priority: P2)

**Goal**: Documentar de forma reproducible el Atajo requerido y la lectura física posterior.

**Independent Test**: Un operador puede seguir la guía sin ver secretos o instrucciones ambiguas del proveedor anterior.

- [x] T012 [US3] Actualizar `docs/runbooks/smoke-tests.md` con NFC.cool activo, configuración de Atajos, fallback y matriz física de 20 ciclos.
- [x] T013 [P] [US3] Actualizar el estado verificable del proveedor y los gates pendientes en `docs/current-status.md`.
- [x] T014 [US3] Actualizar la documentación de API/dashboard que nombre NFC Helper como flujo activo en `apps/api/README.md` y `apps/dashboard/README.md`.

**Checkpoint**: Documentación durable, quickstart y UX describen el mismo proveedor activo y el mismo límite de verificación.

---

## Phase 6: Verificación y convergencia

**Propósito**: Ejecutar gates reproducibles, documentar el gate físico y cerrar la implementación.

- [x] T015 Ejecutar typecheck y build focalizados conforme a `TESTING.md` para API y dashboard (`tsc` API/dashboard y `vite build` dashboard, correctos).
- [x] T016 Ejecutar `pnpm test`, `pnpm typecheck` y `pnpm build` desde la raíz, documentando cualquier bloqueo ajeno al feature (Corepack rechazó `pnpm@9.15.0` por no poder verificar su firma; se ejecutaron las suites y typechecks/builds equivalentes instalados localmente: API 262 passed/17 skipped; dashboard 41 passed; ambos typechecks correctos).
- [ ] T017 Ejecutar la guía de `specs/011-nfc-cool-handoff/quickstart.md` en staging hasta el límite de evidencia disponible; dejar explícitamente pendiente la matriz física de 20 ciclos si no se realiza. **Gate externo pendiente: no se desplegó ni probó un iPhone/NTAG213 en este cambio.**
- [x] T018 Ejecutar `speckit-converge`, implementar cualquier tarea que añada y dejar trazabilidad del resultado en `specs/011-nfc-cool-handoff/tasks.md` (convergencia local: sin brechas de código adicionales; T017 permanece como certificación externa).
- [x] T019 Crear un Conventional Commit enfocado cuando todas las tareas implementables y verificaciones locales hayan concluido (`feat(nfc): switch active handoff to nfc cool`).

## Dependencies & Execution Order

- T001-T003 fijan contrato y pruebas antes de modificar implementación.
- T004-T006 desbloquean la UI y preservan el límite de seguridad.
- T007-T009 entregan el MVP visible; T010-T011 cierran compatibilidad legado.
- T012-T014 documentan el flujo finalmente construido.
- T015-T019 dependen de las fases anteriores. El spike físico sigue siendo evidencia externa y no bloquea la entrega local, pero sí la certificación operativa.

## Parallel Opportunities

- T002 y T003 editan suites diferentes y pueden avanzar en paralelo.
- T012 y T013 editan documentación diferente una vez definidos el contrato y UI.

## Implementation Strategy

1. Fijar respuesta y pruebas de URL antes de crear el adaptador.
2. Cambiar el endpoint sin crear sesión para NFC.cool.
3. Cambiar el botón/UI, preservar el fallback y ocultar por completo NFC Helper.
4. Verificar API/dashboard, actualizar documentación y ejecutar gates globales.
5. Certificar físicamente solo después de probar los 20 ciclos con el hardware objetivo.
