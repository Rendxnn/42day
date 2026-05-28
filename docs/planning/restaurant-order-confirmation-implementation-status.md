# Estado de implementacion: confirmacion de ordenes por restaurante

## Objetivo MVP

Construir el flujo operativo donde:

- el bot solo toma productos activos y disponibles,
- el cliente confirma el pedido,
- la orden queda pendiente de confirmacion del restaurante,
- el dashboard muestra los pedidos hechos,
- el restaurante puede aceptar o marcar agotado un item,
- si un item se agota al confirmar, el backend ofrece por WhatsApp productos de la misma categoria.

## Plan por fases

### Fase 1: base de datos y tipos compartidos

Estado: completada

Incluye:

- migracion para columnas de revision/notificacion en `orders`,
- migracion para `menu_item_id` y `category_snapshot` en `order_items`,
- nuevos estados de `orders` y `conversations`,
- tipos compartidos para metadata de revision y notificacion.

### Fase 2: endpoints backend de pedidos

Estado: completada

Incluye:

- `GET /dashboard/:tenantSlug/orders`
- `GET /dashboard/:tenantSlug/orders/:orderId`
- `POST /dashboard/:tenantSlug/orders/:orderId/accept`
- `POST /dashboard/:tenantSlug/orders/:orderId/reject-out-of-stock`
- `POST /dashboard/:tenantSlug/orders/:orderId/customer-notification/retry`

### Fase 3: respuesta del cliente a reemplazos y continuidad conversacional

Estado: completada

Incluye:

- leer respuesta del cliente cuando llega en `awaiting_replacement_selection`,
- aceptar `1`, `2`, `3` o `cancelar`,
- reemplazar el item en `order_items` y recalcular totales,
- reingresar la orden a `pending_restaurant_confirmation`,
- pasar a `manual` cuando la respuesta no sea interpretable.

### Fase 4: modulo de pedidos en dashboard

Estado: completada

Incluye:

- vista de pedidos hechos,
- filtros de pendientes, reemplazo cliente y aceptados,
- detalle de pedido,
- accion `Aceptar`,
- accion `Agotado`,
- selector de item agotado y alternativas por categoria.

### Fase 5: prueba end-to-end

Estado: en progreso

Incluye:

- pedido normal aceptado por restaurante,
- pedido con item agotado y reemplazo,
- cancelacion por parte del cliente,
- falla de notificacion y retry.

## Hecho hasta ahora

- Existe la definicion funcional en `docs/planning/restaurant-order-confirmation-v1.md`.
- Se resolvio el estado del repo y el merge pendiente para poder continuar implementando.
- Se preparo Fase 1 para introducir soporte de schema y contratos compartidos.
- La migracion `0017_order_restaurant_confirmation_foundation.sql` fue aplicada en Supabase el 2026-05-26.

## Hecho en esta fase

- Migracion `0017_order_restaurant_confirmation_foundation.sql` agregada.
- `orders` ahora queda listo para guardar revision del restaurante y estado de notificacion al cliente.
- `order_items` ahora queda listo para guardar `menu_item_id` y `category_snapshot`.
- `packages/types/src/orders.ts` ahora incluye los nuevos estados y tipos de metadata para agotados/notificaciones.
- `packages/types/src/conversation.ts` ahora incluye `awaiting_restaurant_confirmation` y `awaiting_replacement_selection`.
- Typecheck validado en `@42day/types`, `@42day/api` y `@42day/dashboard`.

## Hecho en Fase 2

- `persistConfirmedOrder()` ahora crea ordenes en `pending_restaurant_confirmation`.
- El router deja la conversacion en `awaiting_restaurant_confirmation`.
- Se agregaron comandos backend para aceptar pedido, devolver por agotado y reintentar notificacion.
- `GET /orders` y `GET /orders/:id` ahora exponen los nuevos campos operativos de la orden.
- La devolucion por agotado ya calcula y guarda alternativas de la misma categoria.
- El backend envia WhatsApp al aceptar o reportar agotado y registra outbound + `app_events`.

## Verificacion de Fase 2

Estado: validada

Validaciones ejecutadas sobre API local y Supabase real:

- `GET /dashboard/demo/orders?status=pending_restaurant_confirmation`
- `GET /dashboard/demo/orders/:orderId`
- `POST /dashboard/demo/orders/:orderId/accept`
- `POST /dashboard/demo/orders/:orderId/reject-out-of-stock`
- `POST /dashboard/demo/orders/:orderId/customer-notification/retry`

Resultado observado:

- el listado devuelve ordenes pendientes de confirmacion,
- el detalle expone `menuItemId` y `categorySnapshot`,
- aceptar cambia la orden a `accepted`,
- aceptar resuelve la alerta pendiente,
- aceptar mueve la conversacion a `completed` para pago en efectivo,
- agotado cambia la orden a `needs_customer_replacement`,
- agotado mueve la conversacion a `awaiting_replacement_selection`,
- agotado guarda `restaurant_review_metadata` con reemplazos de la misma categoria,
- la opcion `markMenuItemUnavailable` deja `menu_items.is_available = false`,
- retry reintenta la notificacion sin cambiar el estado de negocio,
- `messages` y `app_events` registran los envios outbound y los eventos de negocio.

Nota de prueba:

- las notificaciones WhatsApp quedaron en `failed` porque se usaron telefonos dummy para no enviar mensajes reales durante la validacion.

## Falta despues de Fase 2

- UI del modulo de pedidos en dashboard,
- pruebas end-to-end del flujo completo con numeros reales de sandbox o staging controlado.

## Hecho en Fase 3

- `awaiting_replacement_selection` ahora procesa seleccion por numero (`1`, `2`, `3`).
- El bot tambien acepta el nombre del reemplazo si coincide claramente con una opcion.
- `cancelar` ahora cancela la orden y el draft asociado.
- Cuando el cliente elige reemplazo:
  - se actualiza `order_items`,
  - se actualiza `draft_order_items`,
  - se recalculan totales en `orders` y `draft_orders`,
  - la orden vuelve a `pending_restaurant_confirmation`,
  - la conversacion vuelve a `awaiting_restaurant_confirmation`,
  - se crea una nueva alerta `order_pending_confirmation`,
  - se registra `order.customer_replacement_selected`.
- Cuando el cliente cancela:
  - la orden queda `cancelled`,
  - el draft queda `cancelled`,
  - la conversacion queda `completed`,
  - se registra `order.customer_cancelled_after_out_of_stock`.
- Si el cliente responde varias veces con texto no interpretable:
  - la conversacion pasa a `manual`,
  - se crea alerta `order_change_requested`.

## Verificacion de Fase 3

Estado: validada

Validaciones ejecutadas sobre `POST /webhooks/whatsapp` con Supabase real:

- cliente elige reemplazo con `1`,
- cliente escribe `cancelar`,
- cliente responde tres veces con texto ambiguo.

Resultado observado:

- seleccion valida:
  - orden -> `pending_restaurant_confirmation`,
  - conversacion -> `awaiting_restaurant_confirmation`,
  - `order_items` y `draft_order_items` quedan con el nuevo `menu_item_id`,
  - subtotal/total se recalculan,
  - se crea alerta abierta `order_pending_confirmation`.
- cancelacion:
  - orden -> `cancelled`,
  - draft -> `cancelled`,
  - conversacion -> `completed`.
- respuesta ambigua repetida:
  - orden sigue en `needs_customer_replacement`,
  - conversacion -> `manual`,
  - se crea alerta abierta `order_change_requested`.

Nota de prueba:

- las respuestas outbound por WhatsApp se dispararon desde el flujo real del webhook usando numeros dummy.

## Falta despues de Fase 3

- pruebas end-to-end del flujo completo con numeros reales de sandbox o staging controlado.

## Hecho en Fase 4

- Se agrego la vista `Pedidos` al dashboard principal.
- La navegacion ahora incluye una entrada dedicada para pedidos en sidebar y bottom nav.
- La bandeja muestra filtros para:
  - pendientes del restaurante,
  - esperando respuesta del cliente,
  - aceptados/activos,
  - historial.
- La lista de pedidos consume `GET /dashboard/:tenantSlug/orders` con `bucket=all` y filtra en frontend por estado.
- El detalle de pedido consume `GET /dashboard/:tenantSlug/orders/:orderId`.
- Desde el detalle ya se puede:
  - aceptar el pedido,
  - marcar agotado,
  - reintentar la notificacion de WhatsApp cuando falla.
- El modal de agotado obliga a seleccionar:
  - el item agotado,
  - las alternativas activas y disponibles de la misma categoria,
  - si el item original debe marcarse como no disponible en el menu.
- La UI usa el menu del dia cargado en el dashboard para construir la lista de reemplazos por categoria.
- Cuando no existen alternativas activas de esa categoria, la UI bloquea el envio y lo hace visible al operador.

## Verificacion de Fase 4

Estado: validada

Validaciones ejecutadas:

- `corepack pnpm --filter @42day/dashboard typecheck`
- `corepack pnpm --filter @42day/dashboard build`
- servicios locales levantados:
  - dashboard en `http://localhost:5173`
  - api en `http://127.0.0.1:8787`

Resultado observado:

- el frontend compila sin errores de tipos,
- el bundle de produccion se construye correctamente,
- el dashboard queda listo para probar el flujo de pedidos sobre los endpoints ya implementados en Fase 2.

## Falta despues de Fase 4

- pruebas end-to-end del flujo completo con numeros reales de sandbox o staging controlado.

## Hecho en Fase 5

- Se agrego el script reproducible [scripts/e2e_order_confirmation_phase5.py](</c:/Users/Usuario/OneDrive/Documentos/trabajo/gamechanger/automatizacion whatsapp/4-2day/scripts/e2e_order_confirmation_phase5.py>).
- El script crea un usuario temporal de dashboard en Supabase Auth y lo asocia al tenant `demo`.
- El script genera productos/menu items temporales para:
  - pedido normal,
  - producto agotado con reemplazos de la misma categoria (`bebidas`),
  - cancelacion por parte del cliente despues del agotado.
- El script ejecuta el flujo completo usando:
  - `POST /webhooks/whatsapp` para la conversacion del cliente,
  - `POST /dashboard/:tenantSlug/orders/:orderId/accept`,
  - `POST /dashboard/:tenantSlug/orders/:orderId/reject-out-of-stock`,
  - `POST /dashboard/:tenantSlug/orders/:orderId/customer-notification/retry`.
- El script valida estados, ordenes, items, conversacion y persistencia en Supabase.
- El script limpia sus productos/menu items temporales al terminar y elimina el usuario temporal de dashboard.

## Verificacion de Fase 5

Estado: automatizada y validada sobre API local + Supabase real

Comando validado:

```bash
python scripts/e2e_order_confirmation_phase5.py
```

Escenarios validados el 2026-05-27:

- pedido normal:
  - cliente confirma,
  - orden queda `pending_restaurant_confirmation`,
  - restaurante acepta,
  - orden pasa a `accepted`,
  - retry de notificacion mantiene estado y registra nuevo outbound.
- agotado con reemplazo:
  - restaurante marca agotado,
  - orden pasa a `needs_customer_replacement`,
  - cliente responde `1`,
  - item se reemplaza,
  - orden vuelve a `pending_restaurant_confirmation`.
- agotado con cancelacion:
  - restaurante marca agotado,
  - cliente responde `cancelar`,
  - orden pasa a `cancelled`.

Resultado observado:

- el flujo de negocio completo funciona de punta a punta con API local y Supabase real,
- el dashboard backend responde correctamente a los comandos operativos,
- la continuidad conversacional posterior al agotado queda validada,
- la limpieza automatica de fixtures temporales queda validada.

Bloqueo actual para la pasada live de WhatsApp:

- el `META_ACCESS_TOKEN` local usado por el Worker responde `401 Authentication Error` en outbound,
- por eso la validacion live con numero tester real no se puede cerrar desde local hasta refrescar el token o usar staging con credenciales vigentes.

## Falta despues de Fase 5

- refrescar `META_ACCESS_TOKEN` o validar credenciales vigentes en staging,
- ejecutar pasada manual con telefono tester autorizado en Meta,
- confirmar recepcion real de mensajes WhatsApp en el numero tester.
