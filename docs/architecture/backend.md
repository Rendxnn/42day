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

El backend ya no depende solo de `routes/*` y `modules/*`.

Hoy la estructura real es:

- `routes/*` como entrypoints HTTP,
- `features/*` como implementacion real por dominio o flujo,
- `modules/*` como fachadas de compatibilidad interna,
- `shared/*` para errores y helpers transversales.

La orquestacion del flujo principal sigue concentrada funcionalmente en pocos lugares, pero ya no vive toda en los archivos heredados.

Piezas ya refactorizadas:

- `features/chat-routing/*`
- `features/conversations/*`
- `features/menu/*`
- `features/product-configurator/*`
- `features/payment-proofs/*`
- `features/dashboard/router.ts`
- `features/dashboard/auth.ts`
- `features/dashboard/types.ts`

Piezas todavia pendientes de una pasada adicional:

- partir `features/dashboard/router.ts` en subrouters por dominio,
- separar mas `draft-orders` y `orders` en repositorios y mapeos,
- seguir descomponiendo handlers del flujo conversacional.

### Objetivo demo-ready

Mantener el comportamiento actual, pero extraer y endurecer:

- consola humana de alertas y timeline,
- alertas operativas cuando automatizacion este apagada,
- mas pruebas conversacionales de caracterizacion.

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

Estado de refactor:

- hoy actua como fachada hacia `features/conversations/service.ts`,
- ese feature ya separa servicio, repositorio y mapeo.

### `message_router`

Sigue siendo el centro funcional del flujo conversacional, pero ya no todo vive en un solo archivo heredado.

Responsable de:

- detectar senales cerradas,
- decidir si intentar parser semantico,
- operar el draft,
- avanzar de estado,
- mover a `manual`,
- registrar metadata de routing en cada outbound.

Estado de refactor:

- `modules/message-router/router.ts` ya es una fachada,
- la implementacion real vive en `features/chat-routing/router.ts`,
- tracing, outbound y varios helpers ya salieron a modulos propios.
- el subflujo de configurables y el subflujo de transferencia ya viven apoyados en features dedicados, aunque el coordinador central sigue grande.

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

Estado de refactor:

- hoy es una fachada hacia `features/draft-orders/service.ts`,
- ya soporta snapshots estructurados de configurables y `unitPrice` resuelto,
- todavia falta separar mejor repositorio y mappers.

### `order_service`

Responsable de:

- convertir draft confirmado en orden,
- crear `order_items`,
- crear alertas de confirmacion,
- manejar flujo de agotados y reemplazos del cliente.

Estado de refactor:

- hoy es una fachada hacia `features/orders/service.ts`,
- todavia falta separar mejor repositorio, mappers y piezas de reemplazo/notificaciones.

### `dashboard_api`

Responsable de:

- exponer CRUD operativo de menu/catalogo,
- exponer modulo de pedidos,
- aceptar pedido,
- devolver agotado,
- reintentar notificaciones,
- exponer configuracion de automatizacion,
- exponer consola admin para restaurantes y miembros.

Estado de refactor:

- `routes/dashboard.ts` ya es fachada,
- la implementacion real vive en `features/dashboard/router.ts`,
- tipos y auth/tenant access ya salieron a modulos propios,
- el siguiente paso natural es dividir ese router en subrouters de `admin`, `orders`, `alerts`, `settings`, `catalog`, `menu`, `uploads` y `diagnostics`.

### `handoff_service`

Responsable de:

- persistir `human_intervention_alerts`,
- dejar la conversacion en `manual`.

### `product_configurator`

Responsable de:

- resolver configurables contra el menu real,
- validar requeridos, ambiguedades, inactivos y limites,
- construir el snapshot estructurado persistido en draft y order items,
- calcular `priceDelta` y `resolvedUnitPrice`.

### `payment_proofs`

Responsable de:

- detectar si un inbound de WhatsApp es un comprobante util,
- descargar media real desde Meta,
- subir el archivo a Supabase Storage,
- persistir `payment_proofs`,
- mover la orden a `payment_pending_review`,
- exponer lectura y confirmacion minima desde dashboard.

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
