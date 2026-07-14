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
- pedir y recordar datos de facturacion del cliente durante checkout,
- crear ordenes pendientes de confirmacion,
- operar aceptacion, agotados y reintentos desde dashboard,
- demostrar handoff humano.

## Principios

- La interpretacion de toda intencion textual del cliente es semantica durante el experimento actual; no se usa deteccion deterministica de intencion para interferir esa decision.
- Lo deterministico permanece en la capa de negocio: media/ubicacion, resolucion de catalogo y opciones, precios, cobertura, billing, disponibilidad, transiciones y persistencia.
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
| Conversacion natural | Experimento temporal: LLM interpreta todo texto; backend valida y aplica deterministamente |
| LLM inicial | Gemini via `packages/t-router` |
| Timeout | 30 minutos |
| Dashboard data access | Solo via `apps/api`, no directo a Supabase desde frontend |
| Roles operativos | `encargado`, `trabajador` |

## Decision de migraciones multi-tenant

- `control` es schema global canonico.
- `tenant_template` es el template canonico de tenant.
- `tenant_demo` queda como tenant sandbox/demo para pruebas funcionales.
- los demas `tenant_<slug>` son instancias operativas, no fuente canonica de schema.
- una migracion tenant-profesional debe cubrir dos necesidades distintas:
  - baseline canonico para desarrollo futuro: `control` + `tenant_template`
  - rollout operativo para tenants existentes: aplicar el cambio a todos los `tenant_*` ya provisionados
- nuevos tenants no deben nacer re-ejecutando todas las migraciones historicas; deben provisionarse clonando el template canonico vigente y luego sembrando defaults minimos.

## Estado real actual

Ultima actualizacion documental: 2026-07-13.

Ya implementado:

- webhook de WhatsApp,
- persistencia de customers, conversations, messages y addresses,
- menu real desde Supabase,
- flujo de draft -> checkout -> orden,
- validacion fuerte de configurables contra `product_options`,
- flujo de comprobantes de transferencia con persistencia real y revision minima,
- perfiles de facturacion reutilizables por cliente,
- snapshot de facturacion persistido en draft y order,
- estados de revision del restaurante y reemplazos,
- dashboard para pedidos, agotados y progreso operativo,
- consola admin de restaurantes y miembros,
- refactor estructural en progreso de `chat-routing` y del dashboard API hacia submodulos por responsabilidad,
- routing semantico para texto completo, con extraccion conjunta de items y hechos de checkout (fulfillment, direccion, billing y pago),
- suite API inicial para billing y compatibilidad temporal con tenants legacy en lecturas de `locations`.

Todavia incompleto:

- consola humana con bandeja, timeline y compositor de respuesta,
- pruebas automatizadas conversacionales amplias,
- verificacion automatizada de migraciones y del rollout remoto por tenant.

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

Nota de estructura actual:

- `apps/api/src/features/chat-routing/` ya esta migrando hacia carpetas por responsabilidad como `checkout/`, `guided/`, `semantic/`, `transfer/`, `manual/`, `outbound/` y `shared/`.
- `apps/api/src/features/dashboard/` ya usa router modular y se sigue partiendo hacia `routes/*` y `support/*`.
- por compatibilidad, varios archivos flat viejos siguen existiendo como fachadas de reexport mientras termina la migracion interna.

Nota operativa importante:

- `tenant_template` debe mantenerse limpio y estructural, sin uso operativo diario.
- `tenant_demo` puede seguir usandose para pruebas funcionales mientras no se convierta otra vez en template.

## Fuentes de verdad documentales

- Este archivo define producto, alcance y decisiones vigentes.
- [Estado actual](./docs/planning/current-status.md) define estado funcional y operativo.
- `docs/architecture/*` define arquitectura; [migraciones](./docs/architecture/database-migrations.md) define el workflow de schema.
- `docs/runbooks/*` define procedimientos ejecutables. Ningun documento debe duplicar una regla contradictoria.

## Estados de conversacion

- `new`
- `awaiting_mode_selection`
- `awaiting_guided_item_selection`
- `awaiting_product_configuration`
- `awaiting_more_items`
- `awaiting_fulfillment_type`
- `awaiting_address`
- `awaiting_billing_reuse_confirmation`
- `awaiting_normal_billing_info`
- `awaiting_electronic_billing_info`
- `awaiting_payment_method`
- `awaiting_transfer_proof`
- `awaiting_transfer_fallback_payment_method`
- `awaiting_confirmation`
- `awaiting_restaurant_confirmation`
- `awaiting_replacement_selection`
- `manual`
- `completed`
- `expired`

## Automatizacion por conversacion

Cada conversacion abierta puede pausarse o reanudarse por un `encargado` o `trabajador` desde el detalle operativo de pedido o desde la tarjeta de conversaciones abiertas, incluso antes de crear un pedido. Pausar deja el estado en `manual`, conserva el estado de reanudacion y evita la siguiente respuesta automatica; reanudar restaura ese estado y reinicia las aclaraciones.

El cambio es una unica operacion transaccional en el schema del tenant: bloquea la conversacion, valida `updated_at` para evitar escrituras obsoletas, actualiza la conversacion y registra el evento. Al reanudar resuelve solo alertas de handoff de routing (`support_requested`, parser/validacion/error tecnico/cambio de pedido); pagos por transferencia y confirmaciones operativas permanecen abiertos. La brecha humana restante es una bandeja/timeline completa, no el control basico de pausa.

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
