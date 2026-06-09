# Estructura del monorepo

## Objetivo

Mantener backend, frontend, tipos, schema, logica de negocio y documentacion en un solo repositorio, con limites claros para que dos personas puedan trabajar en paralelo.

## Layout

```txt
apps/
  api/
    src/
      routes/
      features/
      modules/
      shared/
      lib/
    README.md

  dashboard/
    README.md

packages/
  core/
  db/
  types/
  config/
  prompts/
  t-router/

docs/
```

## Responsabilidades por carpeta

### `apps/api`

Backend ejecutado en Cloudflare Workers.

Debe contener:

- rutas HTTP,
- features por dominio y flujo,
- webhook de WhatsApp,
- endpoints para dashboard,
- integraciones externas,
- adaptadores hacia base de datos,
- orquestacion del flujo conversacional.

No debe contener:

- reglas de negocio complejas mezcladas en rutas,
- logica de pricing duplicada,
- tipos privados que tambien necesite el dashboard.

Distribucion interna actual recomendada:

- `routes/*`: entrypoints finos.
- `features/*`: implementacion real por dominio.
- `modules/*`: fachadas de compatibilidad interna mientras termina el refactor.
- `shared/*`: errores y utilidades transversales.

### `apps/dashboard`

Aplicacion web del restaurante.

Debe contener:

- vistas,
- componentes,
- formularios,
- estado de UI,
- llamadas al API,
- experiencia visual.

No debe contener:

- calculo final de precios,
- validacion final de disponibilidad,
- creacion directa de ordenes confirmadas sin pasar por backend.

### `packages/core`

Logica de dominio pura.

Ejemplos:

- `calculateOrderTotal`
- `validateDraftOrder`
- `getNextConversationState`
- `isConversationExpired`
- `shouldTriggerHumanHandoff`

### `packages/db`

Base de datos.

Debe contener:

- schema Drizzle,
- migraciones,
- seeds,
- helpers de conexion,
- queries compartidas.

### `packages/types`

Contratos compartidos.

Debe evitar dependencias pesadas. Idealmente solo tipos TypeScript y schemas Zod cuando sean compartidos.

### `packages/config`

Validacion de variables de entorno y configuracion por ambiente.

### `packages/prompts`

Prompts versionados para el parser semantico.

## Regla de dependencia

Dependencias permitidas:

```txt
apps/api -> packages/*
apps/dashboard -> packages/types, packages/config
packages/core -> packages/types
packages/db -> packages/types
packages/prompts -> packages/types
```

Evitar que `packages/core` dependa de `apps/api`, Supabase, Hono o Cloudflare.

## Convencion de trabajo con frontend

El frontend ya consume el backend real via `apps/api`.

Hoy el API ya expone rutas para:

- listar ordenes,
- ver detalle de pedido,
- aceptar pedido,
- reportar agotados,
- reintentar notificacion al cliente,
- listar alertas,
- marcar alerta como `acknowledged` o `resolved`,
- CRUD de productos y catalogo,
- gestion admin de restaurantes y miembros.

El gap principal de frontend ya no es "conectar la UI real". Es cerrar:

- bandeja visual dedicada de alertas,
- timeline de conversacion y mensajes,
- acciones mas completas sobre conversaciones `manual`.
