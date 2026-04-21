# Logging y monitoreo

## Objetivo

Guardar eventos claros para depurar conversaciones, errores, decisiones del sistema y estados del pedido.

## Principios

- Todo evento importante debe tener `tenant`, `conversation_id` cuando exista y `event_name`.
- Los logs deben ser estructurados, no solo texto.
- Los payloads raw de proveedores deben guardarse separados de eventos internos.
- No guardar secretos ni tokens.
- Evitar guardar datos sensibles innecesarios.

## Tabla sugerida

Ver `app_events` en [database-v1.md](./database-v1.md).

Campos:

- `id`
- `conversation_id`
- `draft_order_id`
- `order_id`
- `event_name`
- `severity`
- `source`
- `metadata`
- `created_at`

## Severidades

- `debug`
- `info`
- `warn`
- `error`
- `critical`

## Fuentes

- `whatsapp_webhook`
- `message_router`
- `tenant_resolver`
- `conversation_service`
- `guided_flow_engine`
- `semantic_parser`
- `validation_engine`
- `pricing_engine`
- `order_service`
- `handoff_service`
- `dashboard_api`

## Eventos iniciales

### WhatsApp

- `whatsapp.webhook.received`
- `whatsapp.webhook.verified`
- `whatsapp.webhook.invalid`
- `whatsapp.message.inbound_logged`
- `whatsapp.message.outbound_sent`
- `whatsapp.message.outbound_failed`
- `whatsapp.webhook.duplicate_ignored`

### Tenant

- `tenant.resolved`
- `tenant.not_found`
- `tenant.automation_disabled`

### Conversacion

- `conversation.created`
- `conversation.state_changed`
- `conversation.expired`
- `conversation.manual_enabled`
- `conversation.manual_resolved`

### Draft order

- `draft_order.created`
- `draft_order.updated`
- `draft_order.validation_failed`
- `draft_order.ready_for_confirmation`
- `draft_order.expired`
- `draft_order.cancelled`

### Parser

- `semantic_parser.called`
- `semantic_parser.succeeded`
- `semantic_parser.failed`
- `semantic_parser.low_confidence`

### Validacion y pricing

- `validation.succeeded`
- `validation.failed`
- `pricing.calculated`
- `pricing.failed`

### Orden

- `order.created`
- `order.status_changed`
- `order.payment_pending_review`
- `order.cancelled`

### Handoff

- `handoff.created`
- `handoff.alert_acknowledged`
- `handoff.alert_resolved`

## Ejemplo de metadata

```json
{
  "messageType": "text",
  "route": "free_form_order",
  "previousState": "awaiting_mode_selection",
  "nextState": "awaiting_confirmation",
  "parserConfidence": 0.82
}
```

## Que monitorear en dashboard interno

- cantidad de mensajes entrantes,
- fallas de envio WhatsApp,
- fallas de parser,
- handoffs abiertos,
- ordenes nuevas,
- ordenes pendientes por transferencia,
- conversaciones expiradas,
- tenants sin menu publicado.

