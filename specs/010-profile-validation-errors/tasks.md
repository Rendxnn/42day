# Tareas: Validación comprensible de perfiles

**Feature**: `010-profile-validation-errors`  
**Orden**: pruebas → contrato compartido → backend → UI → documentación y convergencia

## Fase 1: Contratos y regresión (P1)

- [x] T001 [P] Añadir límites y catálogo de mensajes seguros compartidos en `packages/types/src/business-profile-validation.ts` y exportarlos desde `packages/types/src/index.ts` para FR-002 y FR-004–FR-006.
- [x] T002 [P] Añadir pruebas de formatos telefónicos válidos, inválidos, enlaces desactivados y límites de texto en `apps/api/test/business-profiles.test.mjs` para FR-001–FR-003.
- [x] T003 [P] Añadir pruebas de contrato `{ error, message, field? }` y fallback de errores desconocidos en `apps/api/test/business-profiles.test.mjs` y `apps/dashboard/test/business-profiles.test.mjs` para FR-004–FR-006.

**Checkpoint**: los casos nuevos fallan por el comportamiento actual o quedan caracterizados con una justificación.

## Fase 2: Normalización y API segura (P1)

- [x] T004 Ajustar `normalizeBusinessProfilePhone` y `normalizeBusinessProfileLink` en `packages/core/src/business-profile-links.ts` para aceptar separadores/prefijos documentados y rechazar letras/extensiones sin asumir país, para FR-001 y NFR-002.
- [x] T005 Reutilizar límites compartidos, distinguir campo en `BusinessProfileValidationError` y omitir href vacío de enlaces desactivados en `apps/api/src/features/public-profile/business-profile-validation.ts` para FR-001–FR-003.
- [x] T006 Emitir mensajes seguros con campo en `apps/api/src/features/public-profile/business-profile-routes.ts` y mapear la misma validación en `apps/api/src/features/dynamic-links/admin-routes.ts` para FR-004 y NFR-001.
- [x] T007 Alinear límites y mensajes del flujo MCP en `apps/api/src/features/business-setup-agent/mcp-routes.ts` y `apps/api/src/features/business-setup-agent/service.ts` para FR-005.

**Checkpoint**: API, configuración rápida y agente comparten reglas y nunca devuelven copy técnico desnudo.

## Fase 3: Dashboard y copy accionable (P1)

- [x] T008 Añadir `apps/dashboard/src/features/admin/business-profile-errors.ts`, aplicarlo al inventario y extender `DashboardApiError` en `apps/dashboard/src/api.ts` para parsear `message`/`field` y aplicar fallback seguro para JSON inválido, red y códigos desconocidos, para FR-006.
- [x] T009 Actualizar `BusinessProfileModal.tsx` con maxLength, inputMode, ayudas de formato, mensajes por campo y `aria-live`, para FR-007 y NFR-003.
- [x] T010 Actualizar `QuickDynamicLinkSetup.tsx` con límites, placeholders realistas, validación previa de nombre/enlaces/teléfono y traducción de todos los errores de perfil, para FR-006–FR-008.
- [x] T011 Añadir pruebas de UI para que nunca se renderice `business_profile_`, se muestre el formato telefónico y se anuncien errores, para SC-001, SC-003 y NFR-003.

**Checkpoint**: el administrador puede corregir cada campo sin ver identificadores internos.

## Fase 4: Documentación y verificación

- [x] T012 Actualizar `apps/api/README.md`, `apps/dashboard/README.md`, `docs/runbooks/smoke-tests.md` y `specs/010-profile-validation-errors/quickstart.md` con límites, ejemplos y resultados para FR-002, FR-007 y NFR-002.
- [x] T013 Ejecutar typecheck y las suites focalizadas/completas de API/dashboard; registrar comandos y resultados en quickstart.
- [x] T014 Ejecutar el análisis de consistencia y convergencia Spec Kit; no quedaron tareas adicionales tras verificar cobertura, código, pruebas y documentación.
