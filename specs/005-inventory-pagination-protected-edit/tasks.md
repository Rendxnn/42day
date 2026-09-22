# Tareas: inventario paginado y edición protegida

## Fase 1 — Contratos y persistencia

- [x] T001 Crear contratos paginados compartidos en `packages/types/src/dynamic-links.ts`.
- [ ] T002 Añadir RPC, índices, RLS y grants en `supabase/migrations/20260922003645_inventory_pagination_protected_edit.sql` (pendiente aplicar y validar en Supabase local).
- [ ] T003 Añadir pruebas API de query, cursor y exportación en `apps/api/test/dynamic-links.test.mjs`.

## Fase 2 — Inventario (US1)

- [x] T004 [US1] Implementar repositorio y parser de página en `apps/api/src/features/dynamic-links/{repository,admin-routes}.ts`.
- [x] T005 [US1] Migrar cliente y navegación por cursor en `apps/dashboard/src/{api.ts,features/admin/DynamicLinksSection.tsx}`.

## Fase 3 — Protección de edición (US2)

- [x] T006 [US2] Implementar lectura fresca, borrador, confirmación y conflicto en `apps/dashboard/src/features/admin/DynamicLinksSection.tsx`.
- [x] T007 [US2] Cubrir regresiones UI en `apps/dashboard/test/dynamic-link-quick-setup.test.mjs`.

## Fase 4 — Documentación y gates

- [ ] T008 Actualizar estado, arquitectura, runbooks y READMEs afectados (la reconciliación documental completa sigue en fase 0).
- [ ] T009 Ejecutar pruebas, análisis/convergencia y registrar gates externos pendientes.

## Fase 5: Convergencia

- [ ] T010 Validar RPC, índices y exportación completa contra Supabase local por FR-001–FR-005 (missing).
- [ ] T011 Ejecutar pruebas API mediante el runner pnpm fijado y sustituir caracterización UI por interacción observable por FR-001–FR-008 (partial).
- [ ] T012 Completar auditoría documental de los artefactos 001–004 y documentación durable por plan: fase 0 (partial).
