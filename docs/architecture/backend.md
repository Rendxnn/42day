# Arquitectura backend

## Stack

- Cloudflare Workers como runtime.
- Hono como router HTTP.
- Supabase Postgres como base de datos operativa.
- PostgREST/Data API para acceso desde el Worker.
- WhatsApp Cloud API como canal.
- Gemini via `packages/t-router` como parser semantico acotado.

## Flujo tecnico real de un mensaje entrante

Hoy el recorrido real del webhook es este:

```txt
Meta WhatsApp
  -> POST /webhooks/whatsapp
  -> whatsapp_webhook.logRawWebhook()
  -> whatsapp_webhook.normalize()
  -> tenant_resolver.resolveTenantForInboundMessage()
  -> customer_service.findOrCreateCustomer()
  -> conversation_service.loadOrCreateActiveConversation()
  -> message_log.logInboundMessage()
  -> customer_address_service.saveCustomerAddressFromWhatsAppLocation() si aplica
  -> message_router.routeInboundMessage()
  -> sendWhatsAppTextMessage()
  -> message_log.logOutboundTextMessage()
```

## Orquestacion actual vs objetivo

### Estado actual

La orquestacion del flujo principal vive sobre todo en:

- `message_router`,
- `draft_order_service`,
- `order_service`,
- `conversation_service`.

Los modulos `guided_flow_engine`, `validation_engine` y `pricing_engine` existen, pero hoy son mas nominales que orquestadores reales. La logica de decision sigue concentrada en `message_router`.

### Objetivo demo-ready

Mantener el comportamiento actual, pero extraer y endurecer:

- validacion real de configurables y reglas operativas,
- cobertura/horario cuando se active,
- flujo de comprobantes de transferencia,
- alertas operativas cuando automatizacion este apagada.

## Modulos

### `whatsapp_webhook`

Responsable de:

- verificar challenge de Meta,
- registrar raw webhook,
- ignorar duplicados de webhook,
- normalizar payloads,
- iterar mensajes inbound,
- marcar el webhook como procesado.

### `tenant_resolver`

Responsable de:

- resolver tenant por `phone_number_id` y `waba_id`,
- devolver `tenantId`, `slug`, `schemaName`, timezone y flags operativas.

### `conversation_service`

Responsable de:

- crear o reutilizar conversacion activa,
- extender expiracion a 30 minutos,
- expirar conversaciones viejas,
- guardar `state`, `context`, `clarification_attempts` y `manual_reason`.

### `message_router`

Es el centro real del flujo conversacional hoy.

Responsable de:

- detectar senales cerradas,
- decidir si intentar parser semantico,
- operar el draft,
- avanzar de estado,
- mover a `manual`,
- registrar metadata de routing en cada outbound.

### `semantic_parser`

Se usa solo como fallback cuando el usuario escribe un pedido libre o una edicion libre.

Reglas:

- devuelve textos y confianza,
- no calcula precios,
- no resuelve IDs canonicos,
- no decide disponibilidad,
- no confirma ordenes.

### `draft_order_service`

Responsable de:

- crear o reutilizar draft activo,
- agregar/quitar/reemplazar items,
- recalcular totales,
- marcar el draft como listo o con aclaraciones.

### `order_service`

Responsable de:

- convertir draft confirmado en orden,
- crear `order_items`,
- crear alertas de confirmacion,
- manejar flujo de agotados y reemplazos del cliente.

### `dashboard_api`

Responsable de:

- exponer CRUD operativo de menu/catalogo,
- exponer modulo de pedidos,
- aceptar pedido,
- devolver agotado,
- reintentar notificaciones,
- exponer configuracion de automatizacion,
- exponer consola admin para restaurantes y miembros.

### `handoff_service`

Responsable de:

- persistir `human_intervention_alerts`,
- dejar la conversacion en `manual`.

## IA en backend

La IA no reemplaza la state machine.

Secuencia actual:

1. `message_router` intenta resolver por reglas.
2. Si el texto parece pedido libre o edicion libre, intenta `semantic_parser`.
3. Si el parser devuelve baja confianza o no resuelve contra menu, el flujo vuelve al camino deterministico.
4. Cada outbound registra si fue:
   - `deterministic`
   - `llm`
   - `deterministic_after_llm_fallback`

## Idempotencia

Meta puede reenviar webhooks cuando:

- el endpoint tarda mucho,
- responde con error,
- hay problemas de red,
- Meta no confirma entrega del evento.

Hoy ya existe idempotencia inicial a nivel de webhook raw. La siguiente mejora natural es endurecer tambien unicidad por mensaje inbound/outbound persistido.

## Fallas externas

Si falla Gemini:

- el flujo guiado sigue disponible,
- el pedido libre vuelve a matcher deterministico o aclaracion,
- el outbound deja trazabilidad de fallback.

Si falla Supabase:

- no hay cola intermedia en este MVP,
- por tanto la capacidad de reintento depende del comportamiento de Meta y de no perder el webhook antes de persistir.

Si falla WhatsApp outbound:

- el envio queda trazado en `messages`,
- algunos caminos del dashboard ya permiten retry de notificacion al cliente,
- todavia falta una consola humana completa para algunos casos fallidos.

## Automatizacion activa/inactiva

Cada tenant y sede puede tener `automation_enabled`.

Estado actual:

- si esta apagada, el webhook sigue registrando y el router no responde automaticamente.

Gap actual:

- todavia no se crea sistematicamente una alerta operativa cuando la automatizacion esta apagada y entra un mensaje.
