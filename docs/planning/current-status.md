# Estado actual

Ultima actualizacion: 2026-04-21.

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
- advisors de seguridad sin alertas.

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
- resolucion temporal de tenant demo,
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

Resultado observado:

- eventos guardados con `status = received`,
- logs API con `POST /rest/v1/webhook_events -> 201`.

## Limitaciones actuales

Todavia no se guarda el mensaje normalizado en `tenant_demo.messages`.

Todavia no se crean automaticamente:

- `customers`,
- `conversations`,
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

1. Diferenciar eventos `messages` vs `statuses` de WhatsApp.
2. Marcar `control.webhook_events.processed_at`.
3. Resolver tenant desde `control.tenant_channels` en vez de usar fallback por env.
4. Crear o buscar customer por telefono.
5. Crear o cargar conversation activa.
6. Guardar inbound en `tenant_demo.messages`.
7. Guardar outbound en `tenant_demo.messages`.
8. Aplicar timeout de 30 minutos.
9. Responder opciones iniciales desde `message_router`.
10. Empezar flujo guiado con menu seed.

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

- datos minimos de direccion valida,
- reglas iniciales de promociones,
- que pasa si un producto se agota durante una conversacion,
- cuantos intentos de aclaracion antes de handoff,
- quien puede reactivar automatizacion,
- si dashboard consume solo API o tambien Supabase directo,
- mensaje exacto de expiracion,
- eventos que generan notificacion visual/sonora.
