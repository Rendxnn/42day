# API

Backend principal de 42day para el flujo conversacional de WhatsApp, la operacion del dashboard y la consola admin.

## Estado real hoy

El API ya soporta el flujo principal `demo-ready`:

- webhook inbound/outbound de WhatsApp Cloud API,
- resolucion de tenant por canal,
- persistencia de customers, conversations, messages, draft orders y orders,
- menu real desde Supabase,
- pedido guiado y pedido natural simple con fallback LLM acotado,
- configurables con resolucion deterministica contra `product_options`,
- checkout basico,
- orden pendiente de revision del restaurante,
- agotados, reemplazos y reintentos de notificacion,
- comprobantes de transferencia con almacenamiento real y confirmacion minima,
- endpoints operativos para dashboard restaurante,
- endpoints admin para provisionar restaurantes y miembros.

La meta actual sigue siendo demos creibles y pruebas controladas, no un backend de produccion completa.

## Runtime y entrypoints

- runtime: Cloudflare Workers
- router HTTP: Hono
- base de datos: Supabase Postgres via PostgREST/Data API
- canal: WhatsApp Cloud API
- parser semantico: Gemini como primario y OpenRouter como respaldo si el ambiente tiene el secret configurado

Entrypoints actuales:

- `src/index.ts`
- `src/routes/health.ts`
- `src/routes/whatsapp.ts`
- `src/routes/dashboard.ts`

## Estructura real

Hoy el repo esta en una fase intermedia de refactor:

- `src/routes/*`: entrypoints HTTP reales
- `src/features/*`: implementacion nueva por dominio o flujo
- `src/modules/*`: fachadas de compatibilidad interna
- `src/shared/*`: helpers y errores transversales

Piezas ya bastante aterrizadas en `features/*`:

- `chat-routing/*`
- `conversations/*`
- `menu/*`
- `product-configurator/*`
- `payment-proofs/*`
- `orders/*`
- `dashboard/auth.ts`
- `dashboard/types.ts`

## Deuda tecnica importante

### 1. Router dashboard legacy todavia activo

Existe una composicion nueva en `src/features/dashboard/router.ts` y subrouters por dominio, pero el Worker hoy sigue montando `src/routes/dashboard.ts` como router live.

Eso significa que:

- `src/routes/dashboard.ts` sigue siendo una pieza muy grande y activa,
- la separacion por subrouters existe, pero no es la ruta canonica en runtime todavia,
- la documentacion debe tratar esta zona como transicional, no como refactor cerrado.

### 2. Orquestacion conversacional todavia concentrada

`features/chat-routing/*` ya separo varias ramas utiles, pero el coordinador central sigue cargando bastante decision operativa.

### 3. Fachadas heredadas aun delgadas

`validation-engine` y `pricing-engine` siguen existiendo sobre todo por compatibilidad y no representan una capa de dominio fuerte por si solas.

### 4. Deuda fuerte en frontend que impacta el producto completo

Aunque viva en `apps/dashboard`, hoy el frontend sigue teniendo deuda visible:

- `apps/dashboard/src/App.tsx` es un archivo muy grande y concentra demasiada logica,
- `apps/dashboard/src/orders.tsx` tambien concentra bastante UI y comportamiento,
- esa deuda no bloquea demos, pero si vuelve mas fragil la evolucion del producto.

## Validaciones que hoy si existen

- el LLM no decide precios, disponibilidad ni IDs canonicos; el backend siempre valida y decide,
- los configurables ya se resuelven contra `product_options` y `product_option_values`,
- se validan requeridos, ambiguedades, valores inactivos, limites `maxSelect` y `priceDelta`,
- el draft no puede confirmarse si faltan items, fulfillment, direccion de delivery, pago o configuracion pendiente,
- el comprobante de transferencia queda ligado a orden y mensaje antes de pasar a revision humana minima.

## Gaps reales que siguen abiertos

- falta bandeja visual dedicada de alertas y timeline humano en dashboard,
- si la automatizacion esta apagada, el sistema todavia no deja siempre una alerta operativa consistente,
- falta rechazo formal de comprobante con pedido de reenvio,
- falta explotar mejor `addressText`, `confirmationText` y `questions` del parser,
- falta suite conversacional automatizada mas amplia.

## Testing actual

`apps/api` si tiene pruebas automatizadas utiles:

- resolvedor de configurables,
- validacion de draft con configuracion pendiente,
- helpers de comprobantes de transferencia,
- normalizacion de media inbound de WhatsApp.

Comandos principales:

```bash
corepack pnpm --filter @42day/api dev
corepack pnpm --filter @42day/api typecheck
corepack pnpm --filter @42day/api test
```

## Variables relevantes

Backend:

```txt
APP_ENV
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
META_VERIFY_TOKEN
META_ACCESS_TOKEN
META_PHONE_NUMBER_ID
META_WHATSAPP_BUSINESS_ACCOUNT_ID
GEMINI_API_KEY
OPENROUTER_API_KEY
DASHBOARD_ALLOWED_ORIGINS
```

En local, el Worker toma secretos desde `apps/api/.dev.vars`.
