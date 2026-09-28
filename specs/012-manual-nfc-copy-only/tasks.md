# Tareas: copia manual como único flujo NFC

**Input**: documentos de `specs/012-manual-nfc-copy-only/`
**Tests**: obligatorios por SPEC, constitución y regresión externa observada.

> El checkpoint local del 2026-09-28 incluye la implementación parcial para transferencia entre máquinas.
> No sustituye T018–T020 (gates generales, revisión independiente y convergencia) ni declara la feature cerrada.

## Phase 1: Contrato y regresiones

- [x] T001 Activar `specs/012-manual-nfc-copy-only` en `.specify/feature.json` y revisar el estado limpio sin modificar `.codex-artifacts/`.
- [x] T002 [P] Añadir pruebas API del `403`, `410 nfc_handoff_disabled`, ausencia de URL externa y respuesta antes de leer unidad en `apps/api/test/dynamic-links-bulk-nfc.test.mjs` para FR-004–006.
- [x] T003 [P] Añadir pruebas observables del portapapeles, fallo controlado y ausencia de proveedores en `apps/dashboard/test/copy-to-clipboard.test.mjs` y `apps/dashboard/test/bulk-nfc-setup.test.mjs` para FR-001–003 y FR-007–008.
- [x] T004 Actualizar el contrato activo y deprecaciones NFC en `packages/types/src/dynamic-links.ts` conforme a `contracts/manual-nfc-copy-api.md`.

**Checkpoint**: las nuevas expectativas fallan contra el flujo NFC.cool actual.

## Phase 2: User Story 1 — Copiar la URL permanente (P1) 🎯 MVP

**Independent Test**: copiar produce exactamente `unit.publicUrl` y el fallo deja la URL seleccionable.

- [x] T005 [US1] Extraer o adaptar una función testeable de copia y mensajes controlados en `apps/dashboard/src/features/admin/QuickDynamicLinkSetup.tsx` sin request de handoff.
- [x] T006 [US1] Retirar imports, estado y llamada `createNfcHandoff` de `apps/dashboard/src/features/admin/QuickDynamicLinkSetup.tsx` y `apps/dashboard/src/api.ts`.
- [x] T007 [US1] Ejecutar las pruebas focalizadas del dashboard y typecheck; corregir solo fallos del feature.

**Checkpoint**: la configuración rápida entrega una copia usable sin proveedor externo.

## Phase 3: User Story 2 — Retirar proveedores visibles (P1)

**Independent Test**: UI sin proveedor y endpoint anterior con `410` autenticado.

- [x] T008 [US2] Cambiar `POST /admin/dynamic-links/:id/nfc-handoff` a respuesta `410` posterior a autorización en `apps/api/src/features/dynamic-links/admin-routes.ts`.
- [x] T009 [US2] Retirar NFC.cool del camino runtime en `apps/api/src/features/dynamic-links/nfc-handoff.ts` preservando explícitamente la ruta de canje Helper legado.
- [x] T010 [US2] Eliminar botón, instalación, guía de Atajos y copy de NFC.cool en `apps/dashboard/src/features/admin/QuickDynamicLinkSetup.tsx`.
- [x] T011 [US2] Ejecutar pruebas API/dashboard focalizadas y confirmar que la ruta histórica de consumo Helper permanece separada.

**Checkpoint**: ningún flujo normal genera un esquema externo o una sesión nueva.

## Phase 4: User Story 3 — Preservar hitos físicos (P2)

**Independent Test**: copiar/cancelar no llama mutaciones ni cambia la unidad.

- [x] T012 [US3] Añadir prueba del portapapeles que demuestra copia byte a byte sin cliente API en `apps/dashboard/test/copy-to-clipboard.test.mjs`.
- [x] T013 [US3] Mantener el copy de verificación y bloqueo separados en `apps/dashboard/src/features/admin/QuickDynamicLinkSetup.tsx` sin implicar escritura automática.

## Phase 5: Documentación y verificación

- [x] T014 [P] Actualizar `docs/current-status.md`, `docs/runbooks/smoke-tests.md` y `docs/flows/presence-digital.md` con copia manual activa y NFC.cool reemplazado.
- [x] T015 [P] Actualizar `apps/api/README.md`, `apps/dashboard/README.md` y anotar `specs/011-nfc-cool-handoff/spec.md` como reemplazado por 012.
- [x] T016 Ejecutar la búsqueda documental de quickstarts y marcar `specs/008-ios-nfc-handoff/quickstart.md` como histórico sin reescribir evidencia.
- [x] T017 Ejecutar pruebas focalizadas de API/dashboard y typechecks afectados conforme a `TESTING.md`; el launcher pnpm quedó bloqueado por verificación de firma, se usó Node directamente.
- [ ] T018 Ejecutar `pnpm test`, `pnpm typecheck` y `pnpm build`; el launcher bloquea pnpm 9.15.0 por fallo de verificación de firma en red/registro del entorno.
- [ ] T019 Solicitar revisión independiente de `checklists/safety.md`; el implementador no marca sus ítems.
- [ ] T020 Ejecutar `speckit-converge`, resolver tareas añadidas y actualizar `docs/current-status.md` con evidencia local real.
- [ ] T021 Crear Conventional Commit enfocado `fix(nfc): keep manual copy as the only handoff` cuando todos los gates implementables pasen.

## Dependencies & Execution Order

- T001–T004 preceden implementación.
- T005–T007 entregan el MVP y desbloquean T008–T013.
- T014–T016 dependen del comportamiento final.
- T017–T021 cierran la feature; staging y producción no forman parte de este commit.

## Parallel Opportunities

- T002 y T003; T014 y T015.
- Ninguna tarea que toque `QuickDynamicLinkSetup.tsx` debe ejecutarse en paralelo.

## Implementation Strategy

Implementar una fase a la vez. Detenerse si aparece una mutación de datos, una nueva aplicación NFC o la
necesidad de borrar la compatibilidad Helper, porque cualquiera cambia el SPEC aprobado.
