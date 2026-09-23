---

description: "Tareas ordenadas para inventario de perfiles y acciones seguras de agente"
---

# Tareas: Administración de perfiles y acciones para agentes

**Input**: artefactos aprobados en `specs/009-profile-management-agent-actions/`

**Prerrequisitos**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, contratos, quickstart y
checklist de revisión independiente.

**Pruebas**: obligatorias para todo requisito funcional y regresión. RLS, grants, locks, funciones e
idempotencia requieren Supabase local real; inspección de source no basta.

## Fase 1: Preparación y caracterización

**Propósito**: cerrar la revisión de requisitos y capturar el comportamiento defectuoso antes de
modificarlo.

- [ ] T001 Registrar la revisión independiente de requisitos, seguridad y UX en `specs/009-profile-management-agent-actions/checklists/security-ux.md`; si aparece una brecha bloqueante, corregir `specs/009-profile-management-agent-actions/spec.md`, realinear plan/tareas y repetir `$speckit-analyze` antes de código
- [ ] T002 Añadir una regresión que demuestre el límite de 200 y la ausencia de query/cursor en `apps/api/test/business-profile-inventory.test.mjs` para FR-001–FR-005
- [ ] T003 [P] Añadir una caracterización del editor por UUID y ausencia de inventario/modal en `apps/dashboard/test/business-profiles.test.mjs` para US1–US2
- [ ] T004 [P] Preparar fixtures reutilizables de 251 y 10 000 perfiles, QRs disponibles/activos y revisiones en `apps/api/test/helpers/business-profile-fixtures.mjs` para SC-001 y NFR-001
- [ ] T005 Ejecutar las pruebas focalizadas descritas en `specs/009-profile-management-agent-actions/quickstart.md` y registrar que T002/T003 fallan por las regresiones esperadas, no por infraestructura

**Checkpoint**: baseline reproducible y checklist revisada antes de comportamiento nuevo.

---

## Fase 2: Contratos y fundamentos compartidos

**Propósito**: establecer tipos, validadores y dependencias que bloquean las historias.

- [x] T006 Ampliar `packages/types/src/business-profiles.ts` con `BusinessProfileSummary`, filtros, orden, página, uso y errores para FR-001–FR-007
- [ ] T007 [P] Añadir pruebas de validadores que consumen los tipos compartidos en `apps/api/test/business-profile-contracts.test.mjs` para FR-002–FR-005
- [ ] T008 Documentar e instalar versiones compatibles de `@modelcontextprotocol/sdk` y `jose` en `apps/api/package.json` y `pnpm-lock.yaml`, incluyendo la decisión aprobada en `specs/009-profile-management-agent-actions/research.md`
- [x] T009 [P] Añadir bindings/configuración tipada por ambiente para OAuth, audiencia y clientes permitidos en `packages/config/src/env.ts` y `apps/api/src/lib/bindings.ts` para FR-011 y NFR-002
- [x] T010 Ejecutar pruebas de tipos del paquete, typecheck del API y build afectados desde `./` y registrar resultados en `specs/009-profile-management-agent-actions/quickstart.md`
- [ ] T011 Crear un Conventional Commit enfocado de fundamentos desde `./` solo si T006–T010 están verdes

**Checkpoint**: contratos compartidos y dependencias verificadas.

---

## Fase 3: US1 — Encontrar y revisar perfiles (P1)

**Meta**: encontrar cualquier perfil con búsqueda, filtros, orden y cursores estables.

**Prueba independiente**: con 251 perfiles, localizar uno fuera de los primeros 200, recorrer
anterior/siguiente sin duplicados y validar total/tamaños 25/50/100.

### Pruebas

- [x] T012 [P] [US1] Completar pruebas de contrato del endpoint y cursores ligados a parámetros en `apps/api/test/business-profile-inventory.test.mjs` para FR-001–FR-005
- [ ] T013 [P] [US1] Añadir integración Supabase para total, agregación sin N+1, empates y concurrencia en `apps/api/test/business-profile-inventory-db.test.mjs` para FR-001–FR-005
- [ ] T014 [P] [US1] Añadir pruebas de cliente dashboard para serialización/reset de cursor en `apps/dashboard/test/business-profiles.test.mjs` para FR-004–FR-005

### Implementación

- [x] T015 [US1] Crear `control.list_business_profiles_page`, índices iniciales, RLS/grants y comentarios en `supabase/migrations/20260922190000_business_profile_inventory.sql` para FR-001–FR-005
- [x] T016 [US1] Implementar cursor opaco con huella, allowlists y mapeo de página en `apps/api/src/features/public-profile/business-profile-pagination.ts` para FR-003–FR-005
- [x] T017 [US1] Reemplazar el listado fijo por la consulta paginada/agregada en `apps/api/src/features/public-profile/business-profile-repository.ts` para FR-001–FR-005
- [x] T018 [US1] Parsear parámetros y devolver errores/`BusinessProfilePage` en `apps/api/src/features/public-profile/business-profile-routes.ts` para FR-001–FR-005 y FR-011
- [x] T019 [US1] Actualizar `listBusinessProfiles` en `apps/dashboard/src/api.ts` para consumir el contrato paginado y cancelar resultados obsoletos para FR-001–FR-005
- [x] T020 [US1] Ejecutar pruebas API/DB/dashboard, typecheck y build afectados; registrar evidencia en `specs/009-profile-management-agent-actions/quickstart.md`
- [x] T021 [US1] Actualizar contrato as-built y decisiones de índice en `specs/009-profile-management-agent-actions/contracts/business-profile-management-api.md` y `specs/009-profile-management-agent-actions/data-model.md`
- [ ] T022 [US1] Crear Conventional Commit enfocado del inventario desde `./` solo si T012–T021 están verdes

**Checkpoint**: US1 funciona y se prueba sin interfaz de edición nueva.

---

## Fase 4: US2 — Crear y editar en modal (P1)

**Meta**: administrar desde la lista sin pegar UUID y sin perder contexto ni sobrescribir cambios.

**Prueba independiente**: abrir create/edit desde una fila, obtener detalle fresco, provocar 409,
descartar/cancelar y conservar filtros, cursor lógico y foco.

### Pruebas

- [x] T023 [P] [US2] Añadir cobertura de lista, estados vacío/loading/error y apertura create/edit en `apps/dashboard/test/business-profiles.test.mjs` para FR-006 y FR-022
- [ ] T024 [P] [US2] Añadir cobertura de la máquina de estado para detalle fresco, dirty close, 409 sin retry y retorno de foco en `apps/dashboard/test/business-profile-modal.test.mjs` para FR-006–FR-008, FR-022 y SC-002
- [ ] T025 [P] [US2] Ejecutar recorrido accesible manual de teclado, nombres, contraste y 320 px y registrar evidencia fechada en `specs/009-profile-management-agent-actions/quickstart.md` para FR-022

### Implementación

- [x] T026 [US2] Crear inventario responsive, controles y pila de cursores en `apps/dashboard/src/features/admin/BusinessProfilesSection.tsx` para FR-001–FR-006 y FR-022
- [ ] T027 [US2] Mover/refactorizar el formulario a `<dialog>` y extraer estado puro en `apps/dashboard/src/features/admin/BusinessProfileModal.tsx` y `apps/dashboard/src/features/admin/business-profile-state.ts` para FR-006–FR-008 y FR-022
- [x] T028 [US2] Integrar la sección nueva y eliminar la dependencia de UUID manual en `apps/dashboard/src/App.tsx` para US1–US2
- [ ] T029 [US2] Implementar mensajes consistentes de conflicto, carga y validación en `apps/dashboard/src/features/admin/business-profile-ui.ts` para FR-007–FR-008
- [x] T030 [US2] Ejecutar pruebas dashboard, typecheck y build afectados; documentar evidencia en `specs/009-profile-management-agent-actions/quickstart.md`
- [x] T031 [US2] Actualizar comportamiento durable en `apps/dashboard/README.md` y `docs/architecture/dashboard-frontend.md` para FR-006–FR-008 y FR-022
- [ ] T032 [US2] Crear Conventional Commit enfocado del inventario/modal desde `./` solo si T023–T031 están verdes

**Checkpoint**: US2 permite CRUD existente desde un modal protegido.

---

## Fase 5: US3 — Retirar un perfil de forma segura (P1)

**Meta**: ofrecer “Deshabilitar perfil” sin borrar datos ni dejar QRs activos rotos.

**Prueba independiente**: retirar perfiles con cero y varios QRs activos; comprobar transacción,
auditoría, historial visible y ausencia de `DELETE`.

### Pruebas

- [ ] T033 [P] [US3] Añadir pruebas API/DB de impacto fresco, revisión stale y suspensión atómica en `apps/api/test/business-profiles.test.mjs` para FR-009–FR-011 y SC-003
- [ ] T034 [P] [US3] Añadir pruebas UI de confirmación con conteo y filtro de deshabilitados en `apps/dashboard/test/business-profile-modal.test.mjs` para FR-009–FR-010

### Implementación

- [x] T035 [US3] Añadir `usage.activeQrCount` al detalle fresco reutilizando el agregado del listado en `apps/api/src/features/public-profile/business-profile-repository.ts` y `apps/api/src/features/public-profile/business-profile-routes.ts` para FR-009–FR-010
- [x] T036 [US3] Implementar acción/confirmación `Deshabilitar perfil` con refresco de revisión/impacto en `apps/dashboard/src/features/admin/BusinessProfileModal.tsx` para FR-009–FR-010
- [ ] T037 [US3] Ejecutar pruebas API/DB/dashboard, typecheck y build afectados; registrar evidencia en `specs/009-profile-management-agent-actions/quickstart.md`
- [x] T038 [US3] Documentar la semántica sin hard delete en `docs/current-status.md` y `apps/api/README.md` para FR-009–FR-010
- [ ] T039 [US3] Crear Conventional Commit enfocado del retiro seguro desde `./` solo si T033–T038 están verdes

**Checkpoint**: US3 retira sin pérdida ni referencias públicas silenciosamente rotas.

---

## Fase 6: US4 — Preparar un negocio desde conversación móvil (P1)

**Meta**: autenticar al agente y producir una propuesta expirable sin mutar ParaHoy.

**Prueba independiente**: conectar un administrador de staging, listar perfiles y preparar un negocio
con QR; demostrar cero cambios y rechazar tokens/actores/clientes/propuestas inválidos.

### Pruebas

- [ ] T040 [P] [US4] Añadir pruebas de JWT/JWKS, issuer, audience, expiración, `client_id`, rol y revocación en `apps/api/test/business-setup-agent-auth.test.mjs` para FR-011–FR-013, NFR-002 y SC-006
- [x] T041 [P] [US4] Añadir pruebas de herramientas read/prepare, normalización, coincidencias y cero mutaciones en `apps/api/test/business-setup-agent.test.mjs` para FR-012–FR-015 y FR-019
- [ ] T042 [P] [US4] Añadir pruebas DB de RLS, grants, hash de token, expiración y aislamiento actor/cliente en `apps/api/test/business-setup-agent-db.test.mjs` para FR-015 y NFR-002–NFR-003
- [ ] T043 [P] [US4] Añadir pruebas del consentimiento OAuth, cancelación y retorno seguro en `apps/dashboard/test/oauth-consent.test.mjs` para FR-011 y FR-021

### Implementación

- [x] T044 [US4] Crear `control.business_setup_operations`, RLS/grants, restricciones e índices en `supabase/migrations/20260922190001_business_setup_agent.sql` para FR-014–FR-017
- [x] T045 [US4] Implementar validación OAuth/JWT y contexto actor/cliente en `apps/api/src/features/business-setup-agent/auth.ts` para FR-011–FR-013 y NFR-002
- [x] T046 [US4] Implementar cuenta conectada, lectura y preparación sin escrituras en `apps/api/src/features/business-setup-agent/service.ts` para FR-012–FR-015 y FR-019
- [x] T047 [US4] Exponer las herramientas read/prepare con esquemas Zod y anotaciones MCP en `apps/api/src/features/business-setup-agent/mcp-routes.ts` para FR-012–FR-015 y FR-018
- [x] T048 [US4] Montar MCP, metadata OAuth y challenge en `apps/api/src/index.ts` para FR-011–FR-015 y NFR-002
- [ ] T049 [US4] Crear consentimiento OAuth con ambiente/cliente/alcance visible en `apps/dashboard/src/features/auth/OAuthConsentPage.tsx` e integrarlo en `apps/dashboard/src/App.tsx` para FR-011 y FR-021
- [ ] T050 [US4] Añadir logs estructurados sanitizados en `apps/api/src/features/business-setup-agent/observability.ts` para FR-017 y NFR-003
- [ ] T051 [US4] Ejecutar pruebas MCP/auth/DB/dashboard, typecheck y build; registrar evidencia local en `specs/009-profile-management-agent-actions/quickstart.md`
- [ ] T052 [US4] Documentar frontera MCP/OAuth y fallback manual al dashboard en `docs/architecture/backend.md`, `docs/integrations/supabase.md` y `apps/api/README.md` para FR-021
- [ ] T053 [US4] Crear Conventional Commit enfocado de preparación MCP/OAuth desde `./` solo si T040–T052 están verdes

**Checkpoint**: US4 prepara de forma segura; todavía no confirma escrituras.

---

## Fase 7: US5 — Confirmar creación y asignación (P1)

**Meta**: crear/publicar perfil y asignarlo al QR de forma confirmada, atómica e idempotente.

**Prueba independiente**: confirmar una propuesta, perder/repetir conexión y comprobar un único
perfil/asignación/auditoría; stale, vencido o payload diferente revierte todo.

### Pruebas

- [ ] T054 [P] [US5] Añadir integración DB para locks, revisiones, duplicados sin overwrite, activo/archivado, atomicidad e idempotencia en `apps/api/test/business-setup-agent-db.test.mjs` para FR-016–FR-020, FR-023, NFR-004 y SC-005
- [x] T055 [P] [US5] Añadir contrato MCP de confirmación, consentimiento y replay seguro en `apps/api/test/business-setup-agent.test.mjs` para FR-016–FR-018 y SC-006
- [ ] T056 [P] [US5] Añadir regresión para Google Reviews, URL QR permanente y compatibilidad de `/p/:slug` y `/r/:tenantSlug` en `apps/api/test/business-setup-agent.test.mjs` para FR-019–FR-020 y NFR-005

### Implementación

- [x] T057 [US5] Completar `control.commit_business_setup` con locks estables, hash, revisiones, publicación, asignación y auditoría en `supabase/migrations/20260922190001_business_setup_agent.sql` para FR-016–FR-020
- [x] T058 [US5] Implementar orquestación de commit/replay, reutilización sin overwrite y mapeo de errores en `apps/api/src/features/business-setup-agent/service.ts` para FR-016–FR-020, FR-023 y NFR-004
- [x] T059 [US5] Exponer `parahoy_commit_business_setup` con `destructiveHint`, confirmación y resultado estable en `apps/api/src/features/business-setup-agent/mcp-routes.ts` para FR-016–FR-018
- [x] T060 [US5] Ejecutar pruebas DB/MCP, typecheck y build afectados; registrar evidencia en `specs/009-profile-management-agent-actions/quickstart.md`
- [x] T061 [US5] Actualizar contratos/data model con el comportamiento as-built en `specs/009-profile-management-agent-actions/contracts/parahoy-agent-tools.md` y `specs/009-profile-management-agent-actions/data-model.md`
- [ ] T062 [US5] Crear Conventional Commit enfocado del commit atómico desde `./` solo si T054–T061 están verdes

**Checkpoint**: US5 completa el flujo agente localmente sin desplegar.

---

## Fase final: verificación transversal y preparación de convergencia

- [ ] T063 Revisar trazabilidad FR-001–FR-023, NFR-001–NFR-005 y SC-001–SC-006 contra `specs/009-profile-management-agent-actions/tasks.md` y pruebas ejecutables
- [ ] T064 Cargar 10 000 perfiles, ejecutar `EXPLAIN (ANALYZE, BUFFERS)`, medir p95 y cronometrar búsqueda UI completa; documentar índices y resultados en `specs/009-profile-management-agent-actions/quickstart.md` para NFR-001 y SC-001
- [ ] T065 Ejecutar `pnpm test` desde `./` y registrar resultado íntegro en `specs/009-profile-management-agent-actions/quickstart.md`
- [ ] T066 Ejecutar `pnpm typecheck` desde `./` y registrar resultado íntegro en `specs/009-profile-management-agent-actions/quickstart.md`
- [ ] T067 Ejecutar `pnpm build` desde `./` y registrar resultado íntegro en `specs/009-profile-management-agent-actions/quickstart.md`
- [ ] T068 Revisar diff completo por secretos, aislamiento, compatibilidad, logs y cambios ajenos desde `./` contra `CODESTYLE.md`, `TESTING.md` y `.specify/memory/constitution.md`
- [x] T069 Actualizar estado y arquitectura durable en `docs/current-status.md`, `ARCHITECTURE.md`, `docs/architecture/backend.md`, `docs/architecture/dashboard-frontend.md`, `docs/integrations/supabase.md`, `apps/api/README.md` y `apps/dashboard/README.md`
- [ ] T070 Con autorización separada, verificar firma JWT asimétrica y configurar cliente/consentimiento OAuth de Supabase staging, aplicar migraciones/desplegar y ejecutar el recorrido móvil de `specs/009-profile-management-agent-actions/quickstart.md` para FR-021 y SC-004; registrar explícitamente cualquier gate externo pendiente
- [ ] T071 Ejecutar `$speckit-converge`, implementar las tareas que añada en `specs/009-profile-management-agent-actions/tasks.md` y repetir hasta cero brechas
- [ ] T072 Crear Conventional Commit final de documentación/evidencia desde `./` solo con verificaciones verdes; no desplegar ni migrar producción

**Checkpoint**: feature convergido localmente y certificado en staging autorizado; producción sigue
siendo un gate posterior separado.

## Dependencias y orden

```text
Fase 1 -> Fase 2 -> US1 -> US2 -> US3
                         \-> US4 -> US5
US3 + US5 -> verificación final -> converge
```

- US4 depende del endpoint paginado de US1; sus pruebas/auth pueden prepararse antes, pero el
  checkpoint de US4 exige US1 completo.
- US2 depende de US1; US3 depende de US2.
- US5 depende de US4 y de reglas vigentes de perfiles/QR, no del despliegue de staging.
- `[P]` solo significa archivos independientes y dependencias satisfechas; nunca autoriza dos
  migraciones o ediciones del mismo archivo en paralelo.
- Cada fase termina con pruebas, documentación pertinente y commit antes de iniciar su dependiente.

## Oportunidades paralelas

- En preparación: T003 y T004 pueden avanzar tras T002.
- US1: contrato API, integración DB y cliente dashboard (T012–T014).
- US2: pruebas funcionales, conflicto y accesibilidad (T023–T025).
- US3: pruebas API/DB y UI (T033–T034).
- US4: auth, servicio/DB y consentimiento UI (T040–T043).
- US5: atomicidad, contrato MCP y URL/reseñas (T054–T056).

## Estrategia incremental

1. **MVP administrativo**: fases 1–5 entregan inventario, modal y retiro seguro sin depender de MCP.
2. **MVP agente read/prepare**: fase 6 prueba autenticación y propuesta sin riesgo de escritura.
3. **Flujo agente completo**: fase 7 habilita commit únicamente después de evidencia atómica.
4. **Certificación**: gates completos y staging autorizado; producción permanece fuera de alcance.

## Reglas de finalización

- No marcar una tarea sin archivo/evidencia correspondiente.
- No presentar checks bloqueados, externos u omitidos como exitosos.
- Si cambia el comportamiento acordado, actualizar y reaprobar spec/plan antes de código.
- No ejecutar T070 sin autorización explícita de staging en ese momento.
- Implementación no termina hasta que `$speckit-converge` reporte cero brechas.

## Phase 8: Convergence

Estas tareas fueron añadidas tras comparar la implementación actual con los gates y decisiones del
feature. No se presentan como completadas en este turno.

- [ ] T073 Registrar una revisión independiente de `checklists/security-ux.md` y ejecutar las pruebas de RLS, grants, actor, cliente y JWT real contra Supabase local/staging autorizado, per FR-011, NFR-002 y NFR-003 (HIGH, missing)
- [ ] T074 Cambiar `BusinessProfileModal` a un elemento `<dialog>` o implementar un gestor de foco equivalente con foco inicial, retorno al disparador, trampa de foco y navegación por teclado documentada, per FR-022 y US2/AC6 (HIGH, partial)
- [ ] T075 Implementar el consentimiento OAuth visible y el flujo de autorización/PKCE que respalda los endpoints metadata, o retirar esos endpoints hasta tener un authorization server verificable; probar cliente, redirect URI, revocación y ambiente, per FR-021, NFR-002 y US4/AC1 (HIGH, missing)
- [ ] T076 Añadir el logger estructurado específico del agente con `requestId`, herramienta, actor, cliente, duración y resultado sanitizado, sin token ni payload completo, per FR-017 y NFR-003 (MEDIUM, missing)
- [ ] T077 Añadir pruebas automatizadas de detalle modal, conflicto 409, cierre dirty, consentimiento activo, stale profile y RLS/atomicidad a los archivos de prueba previstos, per FR-006–FR-020, FR-023 y SC-002/SC-005/SC-006 (HIGH, missing)
- [ ] T078 Cargar 251 y 10.000 perfiles en staging, ejecutar `EXPLAIN (ANALYZE, BUFFERS)`, medir p95 del endpoint y validar navegación UI completa; registrar evidencia y decidir si se necesita `pg_trgm`, per NFR-001, SC-001 y US1/AC1 (HIGH, missing)
- [ ] T079 Resolver la adopción de `@modelcontextprotocol/sdk`/`jose` o ratificar formalmente el adaptador nativo WebCrypto/JSON-RPC mediante revisión de seguridad y compatibilidad Cloudflare, per plan: dependencias y NFR-002 (MEDIUM, partial)
- [ ] T080 Ejecutar `pnpm test`, `pnpm typecheck` y `pnpm build` desde la raíz cuando el entorno respete `pnpm@9.15.0`, y registrar cualquier bloqueo separado de los checks directos ya verdes, per T065–T067 (MEDIUM, missing)
