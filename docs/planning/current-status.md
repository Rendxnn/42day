# Estado actual

Ultima actualizacion: 2026-04-22.

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
- tenant demo activo,
- sede demo,
- canal WhatsApp demo registrado,
- bucket privado `payment-proofs`,
- grants para Data API,
- indices de foreign keys,
- RLS activado en tablas expuestas por PostgREST,
- advisors de seguridad sin errores de RLS desactivado.

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
- cliente REST minimo para Supabase.

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

Resultado observado antes de la siguiente iteracion de persistencia:

- eventos guardados con `status = received`,
- logs API con `POST /rest/v1/webhook_events -> 201`.

## Limitaciones actuales

La nueva persistencia de `customers`, `conversations`, `messages`, `customer_addresses` y `processed_at` ya esta implementada en codigo.

Ya se aplicaron en Supabase:

- migracion `business_config_and_addresses`,
- migracion `enable_rls_for_exposed_tables`,
- seed `menu_demo.sql`.

Falta volver a desplegar el Worker staging para probar esta version contra Supabase remoto.

Todavia no se crean automaticamente:

- `draft_orders`,
- `orders`.

Todavia no existe:

- flujo guiado,
- menu activo real,
- parser semantico,
- handoff persistido,
- dashboard API,
- descarga/subida real de comprobantes.

## Siguiente objetivo tecnico

Convertir la respuesta fija en el primer motor conversacional persistente.

Secuencia recomendada:

1. Desplegar de nuevo el Worker staging.
2. Probar mensaje de texto desde WhatsApp y verificar `tenant_demo.customers`, `tenant_demo.conversations` y `tenant_demo.messages`.
3. Probar envio de ubicacion desde WhatsApp y verificar `tenant_demo.customer_addresses`.
4. Empezar flujo guiado con menu seed.

## Siguiente objetivo de producto

Probar un flujo guiado minimo:

```txt
usuario escribe hola
-> bot muestra opciones
-> usuario pide ver menu
-> bot muestra menu del dia
-> usuario elige item
-> bot pide delivery/pickup
-> bot pide pago
-> bot muestra resumen
-> usuario confirma
-> se crea order
```

## Decisiones pendientes

Necesitamos definir:

- reglas iniciales de promociones,
- que pasa si un producto se agota durante una conversacion,
- quien puede reactivar automatizacion,
- eventos que generan notificacion visual/sonora.
