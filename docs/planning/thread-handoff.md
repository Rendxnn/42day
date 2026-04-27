# Handoff para continuar desde otro hilo

Ultima actualizacion: 2026-04-26.

## Rama de trabajo

Continuar desde:

```txt
feature/whatsapp-flow-foundations
```

No continuar desde `master`.

## Commits clave en esta rama

```txt
5f22a70 Implement menu display and draft order creation
f57e6b4 Add order console and conversation context foundations
c12f3b2 Document flow decisions and dashboard tenant RLS
```

## Estado real ya implementado

### WhatsApp / backend

Ya funciona:

- recepcion de mensajes desde WhatsApp Cloud API,
- verificacion de webhook,
- persistencia raw en `control.webhook_events`,
- resolucion de tenant por `control.tenant_channels`,
- creacion/busqueda de customer,
- conversacion persistente con timeout de 30 minutos,
- guardado de inbound y outbound,
- guardado de ubicacion WhatsApp en `customer_addresses`,
- respuesta automatica basica,
- comando `menu` con lectura real del menu publicado del dia,
- menu numerado por WhatsApp,
- seleccion inicial por numero,
- creacion o reutilizacion de `draft_order`,
- agregado del primer item a `draft_order_items`,
- cambio de estado a `awaiting_fulfillment_type`.

### Dashboard / API

Ya existen rutas base para:

- tenants,
- menu del dia,
- CRUD de productos,
- CRUD de items del menu,
- uploads de imagen,
- modulo de ordenes,
- modulo de alertas,
- toggle de automatizacion.

El frontend del dashboard ya tiene cliente API para esas rutas, pero el modulo visual completo de ordenes/alertas todavia no esta construido.

## Estado real en Supabase

Proyecto:

```txt
https://ggyhzxyrgbaykdwhtmqx.supabase.co
```

Schemas activos:

- `control`
- `tenant_demo`
- `tenant_arepas`
- `tenant_pizza`

Migraciones importantes ya aplicadas:

- `dashboard_product_images`
- `test_tenants_arepas_pizza`
- `product_images_bucket`
- `business_config_and_addresses`
- `enable_rls_for_exposed_tables`
- `enable_rls_for_dashboard_demo_tenants`
- `order_console_and_conversation_context`

Seed importante ya aplicado:

- `menu_demo.sql`

Importante:

- `tenant_demo` es el tenant operativo del flujo WhatsApp.
- `tenant_arepas` y `tenant_pizza` hoy sirven como tenants demo de catalogo/dashboard, no como tenants operativos completos de conversaciones y ordenes.

## Pruebas que deben pasar ahora

### Typecheck

```bash
corepack pnpm typecheck:direct
```

### Scripts PowerShell utiles

Desde PowerShell en la raiz del repo:

```powershell
.\scripts\powershell\Set-MetaAccessToken.ps1
.\scripts\powershell\Deploy-Api.ps1
.\scripts\powershell\Test-ApiHealth.ps1
```

Guia corta:

- [cloudflare-meta-token-and-deploy.md](/mnt/c/Users/samir/Documents/freelance/42day/docs/runbooks/cloudflare-meta-token-and-deploy.md)

### Deploy staging

```powershell
corepack pnpm --filter @42day/api exec wrangler deploy --env staging
```

### Prueba WhatsApp actual esperada

1. enviar `hola`
2. enviar `menu`
3. enviar `1`

Resultado esperado:

1. `hola`
   - responde con saludo general
2. `menu`
   - responde con menu publicado del dia en formato numerado
3. `1`
   - crea o reutiliza `draft_order`
   - agrega el item seleccionado
   - responde:

```txt
Agregue <producto> a tu pedido.
Llevas <n> item(s) y un subtotal de <valor>.

Ahora dime como lo quieres:
1. Domicilio
2. Pickup
```

## Datos que deben verse en Supabase despues de esa prueba

En `tenant_demo`:

- `messages` con inbound/outbound nuevos,
- `conversations.state = awaiting_fulfillment_type`,
- `conversations.current_draft_order_id` con valor,
- `conversations.context` con:
  - `flow = guided`
  - `activeMenuId`
  - `activeLocationId`
  - `lastSelectedMenuItemId`
- `draft_orders` con una fila nueva o reutilizada,
- `draft_order_items` con el primer item agregado.

## Siguiente bloque exacto de implementacion

Construir este tramo, en este orden:

1. resolver `1 domicilio / 2 pickup`
2. si es `pickup`:
   - guardar `fulfillment_type = pickup`
   - `delivery_fee = 0`
   - pasar a pago
3. si es `delivery`:
   - guardar `fulfillment_type = delivery`
   - pedir direccion o usar ubicacion si ya existe
4. si esta fuera de horario:
   - ofrecer preorden
   - pedir hora
   - guardar `service_timing = scheduled`
   - guardar `scheduled_for`
5. pedir metodo de pago:
   - efectivo
   - transferencia
6. si es transferencia:
   - guardar comprobante luego
   - crear alerta `transfer_payment_review`
   - dejar orden en `payment_pending_review`
7. construir resumen
8. confirmar por cliente
9. crear `order`
10. dejar pendiente de confirmacion manual del restaurante

## Decisiones ya cerradas que no hay que reabrir

- una sola sede por ahora,
- pickup y delivery desde MVP,
- no validar zona todavia,
- Maps queda pendiente para despues,
- fuera de horario se acepta como preorden,
- maximo 2 intentos de aclaracion antes de pasar a humano,
- promociones van en otro feature,
- notificacion visual/sonora por:
  - pedidos pendientes por confirmar,
  - comprobantes de transferencia detectados,
- todas las ordenes terminan en confirmacion manual del restaurante,
- solo `encargado` puede activar/desactivar automatizacion,
- el dashboard consume solo nuestro API por ahora.

## Deuda conocida

- faltan policies RLS reales si luego el dashboard va a tocar Supabase directo,
- Supabase muestra lints informativos por:
  - `RLS enabled no policy`
  - `pg_graphql anon table exposed`
- no bloquean este MVP porque el backend usa `service_role`, pero se deben cerrar antes de abrir acceso cliente serio.
