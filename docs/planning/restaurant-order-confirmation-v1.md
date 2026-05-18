# Confirmacion de ordenes por restaurante V1

## Decision

Para V1 se implementara la opcion 2: el dashboard llama al backend y el backend actualiza la orden, guarda auditoria y notifica al cliente por WhatsApp en la misma accion HTTP.

No se implementa inventario. La disponibilidad operativa se controla con:

- `tenant_<slug>.products.is_active`
- `tenant_<slug>.menu_items.is_available`

El dashboard no envia mensajes de WhatsApp directamente y no calcula totales. Toda transicion operativa de orden pasa por el backend.

## Flujo principal

```txt
Cliente confirma pedido en WhatsApp
-> backend crea order pendiente de revision del restaurante
-> dashboard muestra la orden
-> restaurante acepta o devuelve por agotado
-> backend actualiza base de datos
-> backend notifica al cliente por WhatsApp
-> backend registra outbound en messages y evento en app_events
```

Cuando el cliente confirma el resumen:

```txt
draft_orders.status = confirmed
orders.status = pending_restaurant_confirmation
conversations.state = awaiting_restaurant_confirmation
```

Mensaje al cliente:

```txt
Recibimos tu pedido. El restaurante lo revisa y te confirmamos por aqui en un momento.
```

Para pagos por transferencia, V1 debe pedir el comprobante despues de que el restaurante acepte disponibilidad. Asi se evita que el cliente pague un pedido que puede ser devuelto por agotado.

## Estados nuevos

Agregar a `orders.status`:

```txt
pending_restaurant_confirmation
needs_customer_replacement
```

Significado:

- `pending_restaurant_confirmation`: el cliente ya confirmo el pedido, pero el restaurante aun no acepta disponibilidad.
- `needs_customer_replacement`: el restaurante reporto agotado y el cliente debe elegir reemplazo o cancelar.

Agregar a `conversations.state`:

```txt
awaiting_restaurant_confirmation
awaiting_replacement_selection
```

Significado:

- `awaiting_restaurant_confirmation`: el bot no debe crear otro pedido ni prometer preparacion.
- `awaiting_replacement_selection`: el bot espera respuesta del cliente sobre los reemplazos sugeridos.

## Endpoints del dashboard

Los endpoints viven bajo `apps/api/src/routes/dashboard.ts`.

```txt
GET  /dashboard/:tenantSlug/orders
GET  /dashboard/:tenantSlug/orders/:orderId
POST /dashboard/:tenantSlug/orders/:orderId/accept
POST /dashboard/:tenantSlug/orders/:orderId/reject-out-of-stock
POST /dashboard/:tenantSlug/orders/:orderId/customer-notification/retry
```

### `GET /dashboard/:tenantSlug/orders`

Lista ordenes del tenant. Debe soportar filtros iniciales:

```txt
?status=pending_restaurant_confirmation
?status=needs_customer_replacement
?limit=50
```

Respuesta esperada:

- orden,
- cliente,
- items,
- fulfillment,
- metodo de pago,
- total,
- estado.

### `GET /dashboard/:tenantSlug/orders/:orderId`

Devuelve el detalle operativo de la orden:

- datos del cliente,
- conversacion asociada,
- order items,
- draft original cuando exista,
- metadata de revision del restaurante,
- estado de notificacion al cliente.

### `POST /dashboard/:tenantSlug/orders/:orderId/accept`

Payload:

```json
{
  "note": "Opcional"
}
```

Validaciones:

- usuario autenticado,
- usuario pertenece al tenant,
- rol `encargado` o `trabajador`,
- orden pertenece al tenant,
- orden esta en `pending_restaurant_confirmation`.

Efectos para pago en efectivo:

```txt
orders.status = accepted
orders.restaurant_reviewed_at = now()
orders.restaurant_reviewed_by = auth user id
orders.restaurant_confirmed_at = now()
orders.restaurant_confirmed_by = auth user id
orders.customer_notification_status = sent | failed
orders.customer_notified_at = now() si WhatsApp envio bien
conversations.state = completed
```

Mensaje WhatsApp:

```txt
Listo, tu pedido fue confirmado por el restaurante. Ya lo estamos preparando.
```

Efectos para transferencia:

```txt
orders.status = accepted
conversations.state = awaiting_transfer_proof
```

Mensaje WhatsApp:

```txt
Tu pedido fue confirmado. Puedes hacer la transferencia y enviarnos el comprobante por aqui.
```

### `POST /dashboard/:tenantSlug/orders/:orderId/reject-out-of-stock`

Endpoint principal para notificacion de agotado.

Payload:

```json
{
  "unavailableOrderItemIds": ["order-item-id-1"],
  "replacementMenuItemIds": ["menu-item-id-1", "menu-item-id-2"],
  "markMenuItemsUnavailable": true,
  "note": "Se agoto la bandeja paisa"
}
```

Validaciones:

- usuario autenticado,
- usuario pertenece al tenant,
- rol `encargado` o `trabajador`,
- orden pertenece al tenant,
- orden esta en `pending_restaurant_confirmation`,
- `unavailableOrderItemIds` pertenecen a esa orden,
- `replacementMenuItemIds` pertenecen al menu publicado de hoy,
- reemplazos tienen `menu_items.is_available = true`,
- productos asociados tienen `products.is_active = true`,
- maximo 3 reemplazos.

Efectos:

```txt
orders.status = needs_customer_replacement
orders.restaurant_reviewed_at = now()
orders.restaurant_reviewed_by = auth user id
orders.restaurant_review_note = note
orders.restaurant_review_metadata = {...}
orders.customer_notification_status = sent | failed
orders.customer_notified_at = now() si WhatsApp envio bien
conversations.state = awaiting_replacement_selection
```

Si `markMenuItemsUnavailable = true`, el backend tambien actualiza:

```txt
menu_items.is_available = false
```

para los `menu_item_id` asociados a los items agotados de la orden.

Mensaje WhatsApp:

```txt
Se nos agoto {item agotado}. Tenemos estas opciones disponibles:

1. {reemplazo 1} - {precio}
2. {reemplazo 2} - {precio}

Responde con el numero de la opcion que prefieres o escribe "cancelar".
```

### `POST /dashboard/:tenantSlug/orders/:orderId/customer-notification/retry`

Reintenta la ultima notificacion operativa si WhatsApp fallo. No cambia el estado de la orden.

Payload:

```json
{
  "type": "accepted"
}
```

o:

```json
{
  "type": "out_of_stock"
}
```

Efectos:

- reenvia el mensaje correspondiente,
- registra nuevo outbound en `messages`,
- registra evento en `app_events`,
- actualiza `orders.customer_notification_status`.

## Persistencia en base de datos

Agregar en una migracion futura, aplicada a todos los schemas tenant activos:

```txt
restaurant_reviewed_at timestamptz
restaurant_reviewed_by uuid
restaurant_confirmed_at timestamptz
restaurant_confirmed_by uuid
restaurant_review_note text
restaurant_review_metadata jsonb
customer_notified_at timestamptz
customer_notification_status text
customer_notification_error text
```

`restaurant_review_metadata` guarda el detalle del agotado:

```json
{
  "reason": "out_of_stock",
  "unavailableOrderItemIds": ["..."],
  "unavailableItems": [
    {
      "orderItemId": "...",
      "menuItemId": "...",
      "name": "Bandeja paisa",
      "quantity": 1
    }
  ],
  "replacementMenuItems": [
    {
      "menuItemId": "...",
      "name": "Pollo a la plancha",
      "price": 21000
    }
  ],
  "markMenuItemsUnavailable": true
}
```

Cada notificacion enviada por backend debe crear un registro en `messages`:

```txt
messages.direction = outbound
messages.provider = whatsapp_cloud
messages.provider_message_id = id devuelto por Meta
messages.message_type = text
messages.text = mensaje enviado
messages.status = sent | failed
```

Si WhatsApp falla:

```txt
messages.status = failed
orders.customer_notification_status = failed
orders.customer_notification_error = error corto
```

## Eventos operativos

Registrar en `app_events`:

```txt
order.pending_restaurant_confirmation_created
order.restaurant_accepted
order.out_of_stock_returned_to_customer
order.customer_replacement_selected
order.customer_cancelled_after_out_of_stock
whatsapp.customer_notification_sent
whatsapp.customer_notification_failed
menu_item.marked_unavailable_from_order
```

## Flujo de reemplazo

Cuando la conversacion esta en `awaiting_replacement_selection`:

- si el cliente responde `1`, `2` o `3`, el backend valida contra `orders.restaurant_review_metadata.replacementMenuItems`;
- el backend reemplaza el item agotado en `order_items`;
- el backend recalcula totales;
- la orden vuelve a `pending_restaurant_confirmation`;
- el dashboard vuelve a mostrarla como pendiente;
- el bot responde al cliente:

```txt
Listo, cambiamos el producto. El restaurante confirma el ajuste en un momento.
```

Si el cliente escribe `cancelar`:

```txt
orders.status = cancelled
conversations.state = completed
```

Mensaje:

```txt
Listo, cancelamos el pedido. Gracias por avisarnos.
```

Si el cliente responde algo ambiguo:

```txt
conversations.state = manual
human_intervention_alerts.type = order_change_requested
```

## Reglas V1

- No hay inventario ni decrementos de stock.
- La disponibilidad para vender sale de `menu_items.is_available` y `products.is_active`.
- El restaurante puede marcar un item como agotado desde la accion de devolucion.
- El dashboard no envia WhatsApp directamente.
- El dashboard no calcula totales finales.
- El backend es la unica capa que cambia estados operativos y notifica al cliente.
- Las acciones deben ser idempotentes: doble click en aceptar o devolver no debe enviar dos mensajes.
- Si falla WhatsApp, la orden conserva el estado operativo y queda una notificacion fallida reintentable.

## Alcance fuera de V1

- Outbox o cola asincrona.
- Inventario real.
- Integracion POS.
- Reconciliacion automatica de pagos.
- Plantillas WhatsApp para mensajes fuera de la ventana de servicio.
