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
- `src/features/chat-routing/helpers.ts`
- `src/features/chat-routing/outbound.ts`
- `src/features/chat-routing/tracing.ts`
- `src/features/chat-routing/types.ts`
- `src/features/conversations/*`
- `src/features/menu/*`
- `src/features/product-configurator/*`
- `src/features/payment-proofs/*`
- `src/features/draft-orders/service.ts`
- `src/features/orders/service.ts`
- `src/features/dashboard/auth.ts`
- `src/features/dashboard/types.ts`
- `src/shared/errors/*`

## Estado despues de la segunda pasada

El estado actual ya no es un monolito puro, pero tampoco un refactor cerrado al 100%.

Quedo asi:

- `src/routes/dashboard.ts` y `src/modules/message-router/router.ts` son fachadas finas.
- `dashboard` ya tiene separadas sus definiciones de tipos y la capa de auth/tenant access.
- `chat-routing` ya separa coordinacion, trazabilidad y envio outbound.
- configurables y comprobantes de transferencia ya tienen features dedicados.
- `conversations` y `menu` ya separan servicio de piezas de repositorio, mapeo, matcher o presenter.
- `draft-orders` y `orders` siguen funcionales detras de fachadas, pero todavia requieren una pasada adicional para separar repositorios y mapeos con el mismo nivel.

## Cobertura minima actual

`apps/api` ya tiene un harness basico de pruebas en `test/` para:

- resolvedor de configurables,
- validacion de draft,
- helpers de comprobantes de transferencia,
- normalizacion de media inbound.

Pendiente para siguientes pasadas del mismo refactor:

- partir `features/dashboard/router.ts` en subrouters de admin, orders, alerts, settings, catalog, menu y uploads;
- seguir extrayendo handlers del chat router a modulos por estado;
- terminar de separar repositorios y mappers en `draft-orders` y `orders`;
- ampliar la caracterizacion automatizada del flujo conversacional y del dashboard.
