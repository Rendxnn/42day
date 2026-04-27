# Estado actual

Ultima actualizacion: 2026-04-26.

Referencia de handoff para continuar desde otro hilo:

- [thread-handoff.md](/mnt/c/Users/samir/Documents/freelance/42day/docs/planning/thread-handoff.md)
- [cloudflare-meta-token-and-deploy.md](/mnt/c/Users/samir/Documents/freelance/42day/docs/runbooks/cloudflare-meta-token-and-deploy.md)

## Logro principal

Se valido el primer flujo tecnico end-to-end:

```txt
WhatsApp tester
-> Meta WhatsApp Cloud API
-> Cloudflare Worker staging
-> Supabase control.webhook_events
-> respuesta automatica por WhatsApp
```

El bot respondio en WhatsApp:

```txt
Hola, te ayudo con tu pedido. Puedes ver el menu, hacer pedido guiado, escribirlo como quieras o hablar con alguien del restaurante.
```

## Infraestructura configurada

### Supabase

Proyecto:

```txt
https://ggyhzxyrgbaykdwhtmqx.supabase.co
```

Configurado:

- schema `control`,
- schema `tenant_demo`,
- schema `tenant_arepas`,
- schema `tenant_pizza`,
- tenant demo activo,
- sede demo,
- canal WhatsApp demo registrado,
- bucket privado `payment-proofs`,
- bucket publico `product-images`,
- grants para Data API,
- indices de foreign keys,
- RLS activado en tablas expuestas por PostgREST,
- RLS activado tambien en schemas demo del dashboard.

Canal demo:

```txt
phone_number_id = 1051363798067045
waba_id = 1491008919702313
display_phone_number = +1 555 638 6291
```

### Cloudflare Workers

Worker staging desplegado:

```txt
https://42day-api-staging.42day.workers.dev
```

Configurado:

- secrets de Meta,
- secrets de Supabase,
- `APP_ENV=staging`,
- `META_GRAPH_API_VERSION=v22.0`.

### Meta Developers

Configurado:

- app Meta Developers,
- WhatsApp Cloud API,
- numero tester verificado,
- webhook apuntando al Worker staging,
- suscripcion al evento `messages`.

## Codigo implementado

Backend inicial:

- Hono + Cloudflare Workers,
- `GET /health`,
- `GET /webhooks/whatsapp`,
- `POST /webhooks/whatsapp`,
- verificacion de webhook Meta,
- normalizacion inicial de payload WhatsApp,
- registro raw en `control.webhook_events`,
- idempotencia inicial por `provider_message_id`,
- resolucion de tenant desde `control.tenant_channels`,
- creacion/busqueda de customer por telefono,
- creacion/carga de conversation activa,
- timeout de conversation a 30 minutos,
- guardado de inbound/outbound en `tenant_demo.messages`,
- normalizacion de mensajes tipo ubicacion de WhatsApp,
- almacenamiento de ubicaciones WhatsApp en `tenant_demo.customer_addresses`,
- marcado de webhook procesado,
- envio outbound basico por WhatsApp,
- lectura del menu publicado del dia desde Supabase,
- respuesta `menu` real por WhatsApp con lista numerada,
- seleccion guiada inicial por numero,
- creacion/persistencia inicial de `draft_orders`,
- agregado de items a `draft_order_items`,
- `conversation.context` y `clarification_attempts`,
- cliente REST minimo para Supabase.

Dashboard:

- app `apps/dashboard` integrada al monorepo,
- rutas `/dashboard/*` en `apps/api`,
- CRUD basico de productos,
- CRUD basico de menu del dia,
- rutas base para modulo de ordenes y alertas,
- toggle API para activar/desactivar automatizacion,
- upload de imagen de producto,
- tenant demo `demo`,
- tenants demo adicionales `arepas` y `pizza`.

Paquetes compartidos:

- `@42day/types`,
- `@42day/core`,
- `@42day/config`,
- `@42day/db`.

## Verificacion actual

Comando validado:

```bash
corepack pnpm typecheck:direct
```

Resultado:

```txt
sin errores
```

Query de verificacion en Supabase:

```sql
select
  id,
  provider,
  event_id,
  provider_message_id,
  phone_number_id,
  status,
  error_message,
  received_at
from control.webhook_events
order by received_at desc
limit 20;
```

Resultado observado:

- webhooks recientes con `status = processed`,
- `customer` persistido,
- `conversation` activa con expiracion a 30 minutos,
- inbound y outbound guardados en `tenant_demo.messages`,
- outbound recientes con `status = sent`,
- ubicaciones WhatsApp guardadas en `tenant_demo.customer_addresses`.

## Limitaciones actuales

La persistencia de `customers`, `conversations`, `messages`, `customer_addresses` y `processed_at` ya esta implementada y validada.

Ya se aplicaron en Supabase:

- migracion `dashboard_product_images`,
- migracion `test_tenants_arepas_pizza`,
- migracion `product_images_bucket`,
- migracion `business_config_and_addresses`,
- migracion `enable_rls_for_exposed_tables`,
- migracion `enable_rls_for_dashboard_demo_tenants`,
- migracion `order_console_and_conversation_context`,
- seed `menu_demo.sql`.

Todavia no se crean automaticamente:

- `orders`.

Todavia no existe:

- flujo guiado completo,
- parser semantico,
- handoff persistido,
- flujo real de comprobantes en conversacion,
- confirmacion operativa completa desde dashboard,
- manejo operativo completo de producto agotado al confirmar.

## Siguiente objetivo tecnico

Construir el flujo guiado real de pedido sobre la base persistente ya validada.

Secuencia recomendada:

1. Probar dashboard local contra API local.
2. Implementar delivery/pickup.
3. Implementar pago y resumen.
4. Implementar confirmacion manual desde dashboard.
5. Implementar producto agotado al confirmar y retoma de conversacion.

## Siguiente objetivo de producto

Probar un flujo guiado minimo:

```txt
usuario escribe hola
-> bot muestra opciones
-> usuario pide ver menu
-> bot muestra menu del dia
-> usuario elige item
-> bot crea draft_order y primer item
-> bot pide delivery/pickup
```

## Decisiones pendientes

Necesitamos definir:

- reglas iniciales de promociones.
