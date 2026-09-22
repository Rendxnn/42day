# Plan: inventario paginado y edición protegida

## Decisiones

- El endpoint existente evoluciona a paginación keyset desde una RPC `security invoker` con allowlist de orden; no hay endpoint paralelo.
- El backend sigue siendo el único consumidor de `control`; UI mantiene una pila de cursores para Anterior.
- `active` es protección UX, no inmutabilidad. El bloqueo NFC físico sigue siendo un hito separado.
- La UI usa el contrato de `@42day/types`; una consulta exacta reemplaza o añade una unidad sin depender de la página cargada.

## Seguridad y rollout

La RPC opera solo con `service_role`, con RLS forzado y grants revocados a `anon`/`authenticated`. Los parámetros son valores y el nombre de orden viene de una allowlist. La migración añade índices de orden y de búsqueda; la validación de plan real queda registrada como gate de Supabase local, no se declara realizada aquí. La respuesta conserva el campo `units` para compatibilidad, añade la envoltura de página y el cliente se migra en el mismo cambio.

## Archivos

- `supabase/migrations/*_inventory_pagination_protected_edit.sql`: RPC, índices y grants.
- `packages/types/src/dynamic-links.ts`: contrato paginado.
- `apps/api/src/features/dynamic-links/{admin-routes,repository}.ts`: parser, RPC y exportación filtrada.
- `apps/dashboard/src/{api.ts,features/admin/DynamicLinksSection.tsx}`: filtros server-side, cursores y edición protegida.
- suites API/dashboard y documentación durable: regresiones y operación.

## Trazabilidad

| Requisito | Evidencia |
| --- | --- |
| FR-001–004 | test API de query/cursor + RPC/migración revisada localmente |
| FR-005 | test API de exportación filtrada |
| FR-006 | typecheck de workspace |
| FR-007–008 | test dashboard de flujo y revisión manual 320 px |
