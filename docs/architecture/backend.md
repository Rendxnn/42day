# Arquitectura backend

## Relacion con el estandar de ingenieria

La estructura objetivo y las reglas obligatorias de arquitectura, TDD y documentacion viven en [Estandar de ingenieria y estructura del monorepo](./monorepo.md).

Este documento describe principalmente:

- el runtime y flujo tecnico actual,
- el reparto funcional del backend hoy,
- la distancia entre el estado real y la estructura objetivo.

Si alguna descripcion historica de este archivo entra en conflicto con el estandar del monorepo, prevalece el estandar del monorepo.

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

El backend esta en una fase intermedia de migracion.

Hoy la estructura real es:

- `routes/*` como entrypoints HTTP,
- `features/*` como implementacion principal por dominio o flujo, aunque todavia con mezcla de roles internos,
- `modules/*` como fachadas o costuras de compatibilidad heredadas,
- `shared/*` para errores y helpers transversales.

Importante:

- esta NO es la estructura objetivo final,
- la presencia actual de archivos grandes o mezclados NO debe tomarse como patron para codigo nuevo,
- todo trabajo nuevo debe seguir la estructura definida en `docs/architecture/monorepo.md`.

Piezas con avance parcial de separacion:

- `features/chat-routing/*`
- `features/conversations/*`
- `features/menu/*`
- `features/product-configurator/*`
- `features/payment-proofs/*`
- `features/dashboard/router.ts`
- `features/dashboard/auth.ts`
- `features/dashboard/types.ts`

Piezas que siguen claramente transicionales o incompletas:

- `routes/dashboard.ts`, que sigue siendo grande y activa,
- `features/dashboard/router.ts`, que ya compone subrouters pero todavia concentra bastante logica y helpers,
- `draft-orders` y `orders`, donde todavia hay mezcla de aplicacion, mapping y acceso a datos,
- handlers del flujo conversacional, donde aun queda coordinacion pesada en pocos puntos.

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
- ese feature ya mejoro separacion interna, pero todavia no representa por si solo la estructura objetivo final de `use-cases/domain/ports/adapters`.

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
- el subflujo de configurables y el subflujo de transferencia ya viven apoyados en features dedicados, aunque el coordinador central sigue grande y todavia no debe tomarse como ejemplo de forma final.

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
- todavia falta una migracion mas clara hacia `use-cases`, `domain`, `ports` y `adapters`.

### `order_service`

Responsable de:

- convertir draft confirmado en orden,
- crear `order_items`,
- crear alertas de confirmacion,
- manejar flujo de agotados y reemplazos del cliente.

Estado de refactor:

- hoy es una fachada hacia `features/orders/service.ts`,
- todavia falta separar mejor responsabilidades internas y migrar hacia la estructura objetivo del estandar.

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

- existe una capa historica importante en `routes/dashboard.ts`,
- `features/dashboard/router.ts` ya concentra parte de la composicion nueva por dominio,
- tipos y auth/tenant access ya salieron a modulos propios,
- aun asi, la zona dashboard sigue en transicion y no debe describirse como refactor cerrado.

El objetivo desde ahora no es seguir creando nuevas piezas sobre la mezcla actual, sino mover incrementalmente cada cambio hacia la forma canonica del estandar del monorepo.

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
