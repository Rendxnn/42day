# PROJECT_CONTEXT

## Proyecto

Sistema multi-tenant de automatizacion de pedidos por WhatsApp para restaurantes pequenos y medianos.

## Producto

42day recibe mensajes de clientes por WhatsApp, interpreta el pedido con reglas y apoyo LLM acotado, construye un `draft_order`, calcula el total en backend, confirma con el cliente y deja una `order` lista para revision del restaurante desde dashboard.

## Alcance congelado para demos

El objetivo inmediato no es produccion completa. Es una version `demo-ready` para:

- mostrar menu real,
- tomar pedidos guiados y pedidos naturales simples,
- persistir conversaciones y drafts,
- cerrar checkout basico,
- crear ordenes pendientes de confirmacion,
- operar aceptacion, agotados y reintentos desde dashboard,
- demostrar handoff humano.

## Principios

- El modelo no calcula precios.
- El modelo no decide disponibilidad final.
- El modelo no devuelve IDs canonicos ni crea entidades.
- Todo pedido primero existe como `draft_order`.
- Siempre hay confirmacion del cliente antes de crear `order`.
- Toda orden queda pendiente de revision del restaurante.
- Debe existir fallback a humano.
- El flujo guiado debe existir aunque exista parser semantico.
- La transferencia requiere intervencion humana en MVP/demo-ready.
- La conversacion expira a los 30 minutos sin respuesta.

## Decisiones cerradas

| Tema | Decision |
| --- | --- |
| Monorepo | Si |
| Lenguaje | TypeScript |
| Backend API | Cloudflare Workers + Hono |
| Dashboard | React + Vite dentro de `apps/dashboard` |
| Base de datos | Supabase Postgres |
| Tenant isolation | Schemas separados por tenant mas schema global `control` |
| WhatsApp durante desarrollo | Numero demo de Meta Developers |
| Sedes en demo-ready | Una sede por restaurante |
| Fulfillment | Delivery y pickup |
| Delivery fee | Fijo por sede |
| Pagos | Efectivo y transferencia |
| Transferencia | Se pide solo despues de que el restaurante acepta disponibilidad |
| Confirmacion operativa | Siempre manual por restaurante |
| Conversacion natural | Deterministico primero, LLM solo como parser acotado |
| LLM inicial | Gemini via `packages/t-router` |
| Timeout | 30 minutos |
| Dashboard data access | Solo via `apps/api`, no directo a Supabase desde frontend |
| Roles operativos | `encargado`, `trabajador` |

## Estado real actual

Ya implementado:

- webhook de WhatsApp,
- persistencia de customers, conversations, messages y addresses,
- menu real desde Supabase,
- flujo de draft -> checkout -> orden,
- estados de revision del restaurante y reemplazos,
- dashboard para pedidos, agotados y progreso operativo,
- consola admin de restaurantes y miembros.

Todavia incompleto:

- validacion fuerte de configurables contra `product_options`,
- flujo completo de comprobantes de transferencia,
- consola humana de alertas y timeline de conversacion,
- pruebas automatizadas conversacionales amplias.

## Modulos backend

- `whatsapp_webhook`
- `message_router`
- `tenant_resolver`
- `conversation_service`
- `draft_order_service`
- `semantic_parser`
- `validation_engine`
- `pricing_engine`
- `order_service`
- `handoff_service`
- `dashboard_api`

Nota: `guided_flow_engine`, `validation_engine` y `pricing_engine` existen como modulos nominales, pero hoy la mayor parte de la orquestacion real vive en `message_router` y `draft_order_service`.

## Estados de conversacion

- `new`
- `awaiting_mode_selection`
- `awaiting_guided_item_selection`
- `awaiting_more_items`
- `awaiting_fulfillment_type`
- `awaiting_address`
- `awaiting_payment_method`
- `awaiting_transfer_proof`
- `awaiting_confirmation`
- `awaiting_restaurant_confirmation`
- `awaiting_replacement_selection`
- `manual`
- `completed`
- `expired`

## Estados de draft order

- `draft`
- `needs_clarification`
- `ready_for_confirmation`
- `confirmed`
- `cancelled`
- `expired`

## Estados de order

- `new`
- `pending_restaurant_confirmation`
- `needs_customer_replacement`
- `payment_pending_review`
- `accepted`
- `preparing`
- `on_the_way`
- `delivered`
- `cancelled`

## Non-goals por ahora

- OCR robusto de menus en produccion,
- reconciliacion automatica de pagos,
- inventario,
- POS,
- cobertura geoespacial avanzada,
- multi-idioma,
- analitica avanzada,
- voz/audio.
