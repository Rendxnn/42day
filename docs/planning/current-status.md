# Estado actual

> Nota: este archivo describe estado funcional y operativo. La referencia canónica de arquitectura frontend del dashboard vive en [docs/architecture/dashboard-frontend.md](/Users/rendxnn/Documents/freelance/42day/docs/architecture/dashboard-frontend.md:1).

Ultima actualizacion: 2026-06-26.

Nota operativa reciente:

- el numero nuevo de WhatsApp que se estaba probando fue reasignado temporalmente a `tenant_demo`, porque `tenant_thaledon` no tiene menu operativo publicado en su schema;
- el fallback semantico `gemini -> openrouter` ya quedo implementado en codigo, pero requiere secret y deploy para quedar activo en `staging`;
- detalle: [WhatsApp routing y fallback LLM](../runbooks/whatsapp-routing-and-llm-fallback-2026-06-26.md)

## Resumen ejecutivo

42day ya tiene una base funcional para demos del flujo principal:

- WhatsApp inbound y outbound,
- persistencia conversacional,
- draft order y checkout basico,
- validacion deterministica de configurables con aclaracion conversacional,
- orden pendiente de confirmacion del restaurante,
- dashboard para aceptar pedido,
- dashboard para reportar agotados,
- retoma de conversacion con reemplazos,
- transferencia con almacenamiento de comprobante y revision minima,
- consola admin de restaurantes y miembros,
- notificaciones basicas por pedidos.

La documentacion anterior mezclaba plan, estado, handoff de otros hilos y fases ya absorbidas por el codigo. Desde este punto, este archivo es la referencia principal del estado real.

## Objetivo inmediato

Cerrar una version `demo-ready`, no todavia una version `production-ready`.

Eso significa poder:

- grabar demos creibles,
- dejar que un posible cliente pruebe el flujo principal,
- mostrar operacion real de restaurante en dashboard,
- demostrar donde interviene la IA y donde interviene el humano.

## Infraestructura configurada

### Supabase

- proyecto activo en Supabase,
- schema `control`,
- schemas demo `tenant_demo`, `tenant_arepas`, `tenant_pizza`,
- bucket privado `payment-proofs`,
- bucket publico `product-images`,
- RLS activado en tablas expuestas por PostgREST,
- configuracion lista para dashboard y consola admin.

### Cloudflare Workers

- Worker staging desplegado,
- secrets de Meta y Supabase configurados,
- `APP_ENV=staging`,
- runtime operativo para webhook y dashboard API.

### Meta Developers

- app y sandbox de WhatsApp configurados,
- webhook apuntando al Worker staging,
- tester verificado para pruebas manuales.

## Implementado en codigo

### Backend conversacional

- `GET /health`,
- `GET /webhooks/whatsapp`,
- `POST /webhooks/whatsapp`,
- verificacion de webhook Meta,
- log raw en `control.webhook_events`,
- resolucion de tenant por `control.tenant_channels`,
- customer por telefono,
- conversacion persistente con timeout,
- logging inbound/outbound,
- guardado de ubicacion WhatsApp,
- menu publicado real desde Supabase,
- menu conversacional con `product_options` y `product_option_values`,
- seleccion por numero, nombre, alias o texto simple,
- soporte multi-item simple,
- resolucion deterministica de configurables por nombre, alias y contexto,
- aclaracion secuencial de configurables requeridos en `awaiting_product_configuration`,
- `draft_orders` y `draft_order_items`,
- fulfillment, direccion y pago,
- resumen y confirmacion del cliente,
- `orders` y `order_items`,
- orden en `pending_restaurant_confirmation`,
- soporte de agotados y reemplazos,
- metadata de routing por outbound,
- fallback LLM via `t-router`, con Gemini como primario y OpenRouter como respaldo cuando el ambiente tenga el secret configurado.

### Dashboard restaurante

- vista de pedidos operativa,
- detalle de pedido,
- aceptar pedido,
- revisar comprobante de transferencia desde detalle,
- confirmar pago de comprobante en orden `payment_pending_review`,
- reportar agotado,
- seleccionar reemplazos por categoria,
- reintentar notificacion al cliente,
- mover estados operativos basicos,
- CRUD de productos,
- productos compuestos/configurables,
- menu del dia,
- upload de imagen de producto,
- notificaciones basicas por pedidos nuevos,
- toggle de automatizacion.

### Admin plataforma

- overview admin,
- crear restaurante,
- editar tenant y sede,
- crear miembros,
- resetear password,
- inactivar restaurante y miembros,
- provisionamiento de schema tenant.

## Flujo principal actualmente demostrable

```txt
cliente escribe por WhatsApp
-> bot muestra menu real o interpreta pedido simple
-> si el producto tiene configurables requeridos, pide solo las aclaraciones faltantes
-> se construye draft
-> bot pide fulfillment, direccion y pago
-> cliente confirma
-> backend crea order pendiente de revision
-> dashboard la muestra
-> restaurante acepta o reporta agotado
-> backend notifica al cliente
-> si el pago es transferencia, el cliente envia comprobante
-> backend lo almacena y deja la orden en revision minima de pago
```

## IA: estado actual

La IA no maneja las reglas de negocio. Hoy actua como interpretador semantico de fallback:

- se invoca para todo mensaje textual que no quede resuelto completamente por un match deterministico estricto y valido para el estado,
- devuelve textos, cantidades, opciones y confianza,
- puede extraer `optionTexts`, pero no resuelve IDs finales,
- no calcula precios,
- no devuelve IDs canonicos,
- no decide disponibilidad,
- no confirma ordenes.

El backend siempre resuelve esa salida contra el menu real. Si no es confiable o aplicable, aclara o deriva a humano; no vuelve a un matcher deterministico amplio. En configurables, la IA solo propone texto candidato; la resolucion final, validacion de requeridos y `priceDelta` ya es 100% deterministica.

## Verificacion actual

Validado localmente o por script:

- `npm run test --prefix apps/api`
- `corepack pnpm typecheck:direct`
- script E2E `scripts/e2e_order_confirmation_phase5.py`

Las pruebas automatizadas nuevas ya cubren al menos:

- resolvedor de configurables,
- validacion de draft con configuraciones pendientes,
- deteccion y path de comprobantes de transferencia,
- normalizacion de media inbound de WhatsApp.

El script E2E actual cubre:

- pedido normal aceptado,
- retry de notificacion,
- agotado con reemplazo,
- agotado con cancelacion del cliente.

## Limites actuales conocidos

### Core conversacional

- el router conversacional sigue concentrando mucha orquestacion,
- `validation_engine` y `pricing_engine` todavia son capas muy delgadas o de compatibilidad,
- combinaciones exoticas no modeladas en catalogo siguen requiriendo aclaracion o handoff.

### Transferencia

- ya existe persistencia real del comprobante y confirmacion minima de pago,
- todavia falta rechazo formal del comprobante y pedido de reenvio,
- todavia falta una bandeja humana mejor para revisar estos casos.

### Operacion humana

- la API de alertas existe,
- pero falta una bandeja visual dedicada de alertas y timeline de conversacion,
- falta contexto humano mas completo para conversaciones `manual`.

### Automatizacion

- si la automatizacion esta apagada, el sistema deja de responder,
- pero todavia no deja siempre una alerta operativa consistente por mensaje pendiente.

### Eventos de dominio y notificaciones realtime

Estado actual:

- el dashboard usa Supabase Realtime por WebSocket sobre `INSERT` y `UPDATE` de `orders` del tenant activo,
- el payload de Realtime no se usa directamente: dispara una nueva consulta HTTP de pedidos,
- existe polling de respaldo cada 30 segundos para reconstruir el estado de la campana,
- el historial de la campana consulta un subconjunto fijo de `app_events` mediante `/notifications`,
- el sonido, toast y Browser Notification se disparan solamente cuando aparece un nuevo pedido en estados notificables,
- `app_events`, `messages` y `human_intervention_alerts` son modelos separados,
- el estado de lectura de notificaciones vive solo en memoria del navegador.

Esto sigue siendo una implementacion funcional para demo, no un bus de eventos de dominio completo.

Pendiente para una etapa posterior:

- definir un catalogo tipado y centralizado de eventos de dominio,
- registrar eventos de forma transaccional con el cambio de estado, idealmente mediante outbox,
- separar eventos de auditoria, notificaciones operativas y estados de entrega de WhatsApp,
- persistir notificaciones por usuario/equipo con lectura, acknowledgement, asignacion y deduplicacion,
- publicar notificaciones persistidas por Realtime Broadcast y usar polling solo para reconciliacion con cursor,
- definir una politica explicita de severidad: que eventos producen sonido/notificacion nativa y cuales solo aparecen en el historial,
- cubrir reconexion, reintentos, ordenamiento, idempotencia y pruebas end-to-end.

Referencia detallada: [Notificaciones en tiempo real de pedidos](./realtime-order-notifications.md).

### Testing

- falta suite automatizada de pruebas conversacionales,
- falta cubrir mas escenarios naturales y configurables,
- la prueba manual real con tester de WhatsApp sigue siendo necesaria.

## Siguiente referencia

Para el alcance cerrado y el plan de cierre demo-ready:

- [Scope congelado demo-ready](./business-decisions.md)
- [Gap analysis demo-ready](./demo-ready-gap-analysis.md)
- [Conversacion natural e integracion IA](./natural-conversation-implementation-plan.md)
