# Auditoría documental QR/NFC y perfiles

**Corte:** 2026-09-22. Este documento registra qué documentos son fuente histórica, cuáles reflejan el
estado actual y qué deuda queda fuera del cierre de la Fase 1.

## Estado actual

- [Estado actual](./current-status.md), [arquitectura raíz](../ARCHITECTURE.md), [API](../apps/api/README.md),
  [dashboard](../apps/dashboard/README.md), [backend](./architecture/backend.md), [frontend](./architecture/dashboard-frontend.md),
  [migraciones](./architecture/database-migrations.md) y [smoke tests](./runbooks/smoke-tests.md) reflejan
  inventario paginado, edición protegida y el inicio de perfiles ligeros.
- La migración `20260922003645_inventory_pagination_protected_edit.sql` y la prueba
  `supabase/tests/dynamic-link-pagination.sql` son la referencia ejecutable de la Fase 1.
- `specs/005-inventory-pagination-protected-edit/` contiene contratos, quickstart y tareas reconciliadas.
  Su checklist de revisión permanece abierto porque exige una persona distinta del implementador.

## Artefactos históricos

- `specs/001-headless-chat/`: contratos, investigación, plan y evidencia histórica se conservan sin
  reescribir cifras ni resultados. Sus tareas deben reconciliarse con Git en un trabajo separado.
- `specs/002-dynamic-links/`: contrato y plan describen el diseño inicial; el inventario paginado y los
  perfiles son extensiones posteriores documentadas en 005 y 006. No se reemplaza la evidencia histórica.
- `specs/003-mobile-quick-setup/`: describe correctamente el flujo individual y el límite original de
  200 unidades; el límite actual del inventario está en 005.
- `specs/004-google-review-resolution/`: contrato y quickstart siguen siendo válidos para el resolver; la
  validación física y staging continúan siendo gates externos.

## Pendientes documentales

1. Una revisión independiente debe cerrar `specs/005.../checklists/review.md`.
2. La Fase 2 debe actualizar la documentación durable cuando backfill, editor de restaurante y staging
   tengan evidencia, sin alterar los documentos históricos 001–004.
3. La auditoría final debe revisar enlaces, comandos y fechas antes de `speckit-converge` de 006.
