# Estado actual

Ultima actualizacion: 2026-06-07.

## Resumen ejecutivo

42day ya tiene una base funcional para demos del flujo principal:

- WhatsApp inbound y outbound,
- persistencia conversacional,
- draft order y checkout basico,
- orden pendiente de confirmacion del restaurante,
- dashboard para aceptar pedido,
- dashboard para reportar agotados,
- retoma de conversacion con reemplazos,
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
- seleccion por numero, nombre, alias o texto simple,
- soporte multi-item simple,
- `draft_orders` y `draft_order_items`,
- fulfillment, direccion y pago,
- resumen y confirmacion del cliente,
- `orders` y `order_items`,
- orden en `pending_restaurant_confirmation`,
- soporte de agotados y reemplazos,
- metadata de routing por outbound,
- fallback LLM con Gemini via `t-router`.

### Dashboard restaurante

- vista de pedidos operativa,
- detalle de pedido,
- aceptar pedido,
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
-> se construye draft
-> bot pide fulfillment, direccion y pago
-> cliente confirma
-> backend crea order pendiente de revision
-> dashboard la muestra
-> restaurante acepta o reporta agotado
-> backend notifica al cliente
```

## IA: estado actual

La IA no maneja todo el flujo. Hoy actua como parser semantico acotado:

- intenta ayudar solo cuando el mensaje parece pedido libre o edicion libre,
- devuelve textos, cantidades, opciones y confianza,
- no calcula precios,
- no devuelve IDs canonicos,
- no decide disponibilidad,
- no confirma ordenes.

El backend siempre intenta resolver esa salida contra el menu real y puede volver al camino deterministico si la salida no es confiable o no es aplicable.

## Verificacion actual

Validado localmente o por script:

- `corepack pnpm typecheck:direct`
- modulo de pedidos del dashboard compilando
- script E2E `scripts/e2e_order_confirmation_phase5.py`

El script E2E actual cubre:

- pedido normal aceptado,
- retry de notificacion,
- agotado con reemplazo,
- agotado con cancelacion del cliente.

## Limites actuales conocidos

### Core conversacional

- la validacion de configurables contra `product_options` todavia no es robusta,
- `validation_engine` y `pricing_engine` todavia son capas muy delgadas,
- el router concentra demasiada orquestacion.

### Transferencia

- falta descargar y almacenar el archivo real del comprobante,
- falta asociarlo a mensaje y orden,
- falta mover la orden a `payment_pending_review` de forma completa.

### Operacion humana

- la API de alertas existe,
- pero falta una bandeja visual dedicada de alertas y timeline de conversacion,
- falta contexto humano mas completo para conversaciones `manual`.

### Automatizacion

- si la automatizacion esta apagada, el sistema deja de responder,
- pero todavia no deja siempre una alerta operativa consistente por mensaje pendiente.

### Testing

- falta suite automatizada de pruebas conversacionales,
- falta cubrir mas escenarios naturales y configurables,
- la prueba manual real con tester de WhatsApp sigue siendo necesaria.

## Siguiente referencia

Para el alcance cerrado y el plan de cierre demo-ready:

- [Scope congelado demo-ready](./business-decisions.md)
- [Gap analysis demo-ready](./demo-ready-gap-analysis.md)
- [Conversacion natural e integracion IA](./natural-conversation-implementation-plan.md)
