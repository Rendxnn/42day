# PROJECT_CONTEXT

## Proyecto

Sistema multi-tenant de automatizacion de pedidos por WhatsApp para restaurantes pequenos y medianos.

## Producto

El sistema recibe mensajes de clientes por WhatsApp, guia o interpreta pedidos, valida el pedido contra el menu activo, calcula el total, pide datos faltantes, confirma con el cliente y crea una orden final visible en dashboard.

## Principios

- El modelo no calcula precios.
- El modelo no decide disponibilidad final.
- El modelo solo extrae estructura desde mensajes libres.
- Todo pedido primero existe como `draft_order`.
- Siempre hay confirmacion final antes de crear una `order`.
- Debe existir fallback a humano.
- El flujo guiado debe existir aunque exista flujo semantico.
- Transferencia bancaria siempre puede requerir intervencion humana para validar pago.
- La conversacion se cierra explicitamente si el usuario pasa 30 minutos sin responder.

## Decisiones actuales

| Tema | Decision |
| --- | --- |
| Monorepo | Si |
| Lenguaje | TypeScript |
| Backend API | Cloudflare Workers + Hono |
| Dashboard | Next.js o app Node existente dentro de `apps/dashboard` |
| Base de datos | Supabase Postgres |
| ORM recomendado | Drizzle |
| Tenant isolation | Schemas separados por tenant, mas schema global/control |
| WhatsApp durante desarrollo | Numero demo de Meta Developers |
| WhatsApp futuro | Preparar modelo para agregar clientes nuevos rapidamente |
| Menu MVP | Menu del dia como producto principal, con productos, combos, promociones y precios |
| Sedes MVP | Una sede por restaurante |
| Entrega V1 | Domicilio y pickup |
| Domicilio | Precio fijo inicial por restaurante |
| Pagos V1 | Efectivo y transferencia |
| Transferencia | Crear orden `payment_pending_review`, almacenar comprobante y generar alerta/intervencion humana |
| Combos | Relacionados con productos existentes mediante componentes del combo |
| Comprobantes | Almacenar archivos en Supabase Storage y metadata en Postgres |
| Tono del bot | Espanol casual, diario, simple y ligeramente amistoso |
| Roles dashboard | `encargado`, `trabajador` |
| Confirmacion | Botones interactivos y texto libre |
| Timeout | 30 minutos sin respuesta cierran la sesion/draft activo |

## Alcance dashboard V1

- Ver ordenes.
- Ver alertas de intervencion humana.
- Recibir notificaciones operativas.
- Subir menu.
- CRUD completo de productos con precios.
- CRUD de combos.
- CRUD de promociones.
- Gestionar menu del dia.

## Modulos backend

- `whatsapp_webhook`
- `message_router`
- `tenant_resolver`
- `conversation_service`
- `draft_order_service`
- `guided_flow_engine`
- `semantic_parser`
- `validation_engine`
- `pricing_engine`
- `order_service`
- `handoff_service`
- `dashboard_api`

## Estados de conversacion

- `new`
- `awaiting_mode_selection`
- `awaiting_guided_item_selection`
- `awaiting_address`
- `awaiting_payment_method`
- `awaiting_transfer_proof`
- `awaiting_confirmation`
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
- `payment_pending_review`
- `accepted`
- `preparing`
- `on_the_way`
- `delivered`
- `cancelled`

## Non-goals MVP

- OCR de menus.
- Reconciliacion automatica de pagos.
- Analitica avanzada.
- Audio/voz.
- Inventario.
- Multi-idioma.
- POS.
- Optimizacion de rutas.
