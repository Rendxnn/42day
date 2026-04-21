# Schema de base de datos V1

## Decision de aislamiento

Usaremos schemas separados por tenant.

Estructura sugerida:

```txt
control.*              # datos globales y resolucion de tenants
tenant_demo.*          # datos operativos del tenant demo
tenant_<slug>.*        # datos operativos de cada restaurante
```

## Schema `control`

### `control.tenants`

Restaurante o negocio.

Campos sugeridos:

- `id`
- `name`
- `slug`
- `schema_name`
- `status`
- `timezone`
- `currency`
- `automation_enabled`
- `created_at`
- `updated_at`

### `control.tenant_channels`

Canales conectados.

- `id`
- `tenant_id`
- `provider` = `whatsapp_cloud`
- `phone_number_id`
- `waba_id`
- `display_phone_number`
- `status`
- `created_at`

### `control.tenant_users`

Usuarios del dashboard asociados a tenants.

- `tenant_id`
- `user_id`
- `role` = `encargado | trabajador`
- `status`

### `control.webhook_events`

Eventos raw recibidos desde proveedores.

- `id`
- `provider`
- `event_id`
- `provider_message_id`
- `phone_number_id`
- `tenant_id`
- `payload`
- `received_at`
- `processed_at`
- `status`
- `error_message`

## Schema por tenant

### `locations`

Sedes.

Decision MVP: una sola sede por restaurante. Se mantiene la tabla para no bloquear crecimiento futuro.

- `id`
- `name`
- `address`
- `phone`
- `delivery_fee_fixed`
- `is_active`
- `created_at`
- `updated_at`

### `products`

Catalogo base.

- `id`
- `name`
- `description`
- `base_price`
- `category`
- `is_active`
- `created_at`
- `updated_at`

### `product_options`

Opciones o variantes.

- `id`
- `product_id`
- `name`
- `type`
- `is_required`
- `min_select`
- `max_select`

### `product_option_values`

Valores posibles.

- `id`
- `option_id`
- `name`
- `price_delta`
- `is_active`

### `combos`

Combos configurables.

- `id`
- `name`
- `description`
- `price`
- `is_active`

### `combo_items`

Relacion entre combos y productos existentes.

- `id`
- `combo_id`
- `product_id`
- `quantity`
- `is_required`
- `group_name`
- `sort_order`

Notas:

- El combo tiene precio propio en `combos.price`.
- Los productos asociados sirven para explicar, validar y preparar el combo.
- En V1 no se necesita un motor complejo de sustituciones; si se requieren opciones se pueden apoyar en `product_options`.

### `promotions`

Promociones simples V1.

- `id`
- `name`
- `description`
- `type`
- `value`
- `starts_at`
- `ends_at`
- `is_active`

### `menus`

Menu publicado para una fecha/sede.

- `id`
- `location_id`
- `date`
- `name`
- `status` = `draft | published | archived`
- `created_at`
- `published_at`

### `menu_items`

Productos disponibles en un menu del dia.

- `id`
- `menu_id`
- `product_id`
- `display_name`
- `price_override`
- `available_quantity`
- `is_available`
- `sort_order`

### `customers`

Clientes conocidos.

- `id`
- `phone`
- `name`
- `default_address`
- `created_at`
- `updated_at`

### `conversations`

Hilo conversacional.

- `id`
- `customer_id`
- `channel`
- `state`
- `current_draft_order_id`
- `manual_reason`
- `last_inbound_at`
- `expires_at`
- `created_at`
- `updated_at`

### `messages`

Log de mensajes.

- `id`
- `conversation_id`
- `direction` = `inbound | outbound`
- `provider`
- `provider_message_id`
- `message_type`
- `text`
- `payload`
- `status`
- `created_at`

Indice unico sugerido:

```txt
provider + provider_message_id + direction
```

### `draft_orders`

Pedido mutable.

- `id`
- `conversation_id`
- `customer_id`
- `location_id`
- `status`
- `fulfillment_type` = `delivery | pickup`
- `delivery_address`
- `payment_method`
- `subtotal`
- `delivery_fee`
- `discount_total`
- `total`
- `validation_errors`
- `expires_at`
- `created_at`
- `updated_at`

### `draft_order_items`

Items del draft.

- `id`
- `draft_order_id`
- `menu_item_id`
- `product_id`
- `name_snapshot`
- `quantity`
- `unit_price`
- `options_snapshot`
- `notes`
- `line_total`

### `orders`

Pedido final confirmado.

- `id`
- `draft_order_id`
- `customer_id`
- `location_id`
- `status`
- `fulfillment_type` = `delivery | pickup`
- `delivery_address`
- `payment_method`
- `payment_proof_file_id`
- `subtotal`
- `delivery_fee`
- `discount_total`
- `total`
- `created_at`
- `updated_at`

### `order_items`

Items finales.

- `id`
- `order_id`
- `product_id`
- `name_snapshot`
- `quantity`
- `unit_price`
- `options_snapshot`
- `notes`
- `line_total`

### `human_intervention_alerts`

Alertas para el dashboard.

- `id`
- `conversation_id`
- `draft_order_id`
- `order_id`
- `type`
- `status` = `open | acknowledged | resolved`
- `title`
- `description`
- `metadata`
- `created_at`
- `resolved_at`

### `payment_proofs`

Comprobantes de transferencia recibidos por WhatsApp.

- `id`
- `conversation_id`
- `message_id`
- `draft_order_id`
- `order_id`
- `storage_bucket`
- `storage_path`
- `provider_media_id`
- `mime_type`
- `file_size`
- `status` = `received | stored | review_pending | approved | rejected`
- `created_at`
- `reviewed_at`
- `reviewed_by`

Decision V1:

- almacenar el archivo en Supabase Storage,
- guardar metadata en Postgres,
- crear alerta `transfer_payment_review`,
- dejar la orden en `payment_pending_review` hasta revision humana.

### `app_events`

Eventos estructurados de monitoreo.

- `id`
- `conversation_id`
- `draft_order_id`
- `order_id`
- `event_name`
- `severity`
- `source`
- `metadata`
- `created_at`

## Nota sobre schemas separados

Ventajas:

- aislamiento fuerte entre restaurantes,
- dumps/restores por cliente mas claros,
- menos riesgo de mezclar datos operativos.

Costos:

- migraciones mas complejas,
- queries multi-tenant mas dificiles,
- dashboard/admin global requiere mas cuidado.

Recomendacion: mantener `control` global y automatizar migraciones a todos los schemas tenant.
