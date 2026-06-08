# API architecture

`apps/api` ya no depende solo de `routes/*` y `modules/*` como puntos de implementacion reales.

La estructura actual se organiza asi:

- `src/routes/*`: entrypoints HTTP finos.
- `src/features/*`: implementacion real por dominio o flujo.
- `src/modules/*`: fachadas de compatibilidad interna para imports heredados.
- `src/shared/*`: utilidades transversales de infraestructura.

## Principios

- Las rutas no deben concentrar acceso a datos, side effects externos y logica de negocio al mismo tiempo.
- Los features pueden seguir usando funciones explicitas y pragmáticas; no se introdujo una capa abstracta generica de repositorios.
- Los modulos heredados se conservan como fachadas para reducir churn y permitir refactor incremental.

## Estado de migracion

Hoy la implementacion real ya vive en:

- `src/features/dashboard/router.ts`
- `src/features/chat-routing/router.ts`
- `src/features/conversations/*`
- `src/features/menu/*`
- `src/features/draft-orders/service.ts`
- `src/features/orders/service.ts`

Pendiente para siguientes pasadas del mismo refactor:

- partir `features/dashboard/router.ts` en subrouters de admin, orders, alerts, settings, catalog, menu y uploads;
- seguir extrayendo handlers del chat router a modulos por estado;
- terminar de separar repositorios y mappers en `draft-orders` y `orders`;
- incorporar un harness estable de caracterizacion automatizada para la API.
