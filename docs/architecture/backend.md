# Arquitectura backend

## Stack

- Cloudflare Workers como runtime.
- Hono como router HTTP.
- Supabase Postgres como base de datos.
- Drizzle como ORM/migraciones.
- WhatsApp Cloud API como canal.
- LLM solo para parser semantico de pedidos libres.

## Flujo tecnico de un mensaje entrante

```txt
Meta WhatsApp
  -> POST /webhooks/whatsapp
  -> whatsapp_webhook.normalize()
  -> tenant_resolver.resolveByPhoneNumberId()
  -> message_log.storeInbound()
  -> conversation_service.loadOrCreate()
  -> timeout check
  -> message_router.route()
  -> guided_flow_engine o semantic_parser
  -> validation_engine
  -> pricing_engine
  -> draft_order_service.update()
  -> whatsapp_client.sendMessage()
  -> message_log.storeOutbound()
```

## Modulos

### `whatsapp_webhook`

Responsable de:

- verificar challenge de Meta,
- recibir eventos inbound,
- validar firma si se configura `APP_SECRET`,
- normalizar payloads,
- responder rapido a Meta.

Meta puede reenviar webhooks si no recibe respuesta exitosa. Por eso el webhook debe ser idempotente.

### `tenant_resolver`

Durante desarrollo:

- usa el `META_PHONE_NUMBER_ID` del numero demo.
- resuelve a un tenant demo.

En produccion:

- consulta `control.tenant_channels`,
- usa `phone_number_id` y `waba_id`,
- devuelve tenant, schema y configuracion.

### `conversation_service`

Responsable de:

- crear conversaciones,
- mantener estado actual,
- asociar customer,
- asociar draft activo,
- cerrar por timeout,
- poner conversacion en `manual`.

### `message_router`

Clasifica el mensaje segun:

- estado de conversacion,
- tipo de payload,
- texto recibido,
- botones/list replies,
- si hay draft activo,
- si hay handoff manual.

### `guided_flow_engine`

Maneja seleccion paso a paso.

Debe ser deterministico y funcionar aunque el parser semantico este apagado.

### `semantic_parser`

Solo se usa si el usuario escribe un pedido libre.

Entrada:

- mensaje crudo,
- menu activo,
- opciones permitidas,
- tono/idioma.

Salida:

- candidato estructurado,
- dudas,
- campos faltantes,
- confianza.

Nunca debe:

- calcular precios,
- inventar productos,
- decidir disponibilidad,
- confirmar ordenes.

### `validation_engine`

Valida:

- existencia de productos,
- disponibilidad en menu del dia,
- variantes/opciones,
- cantidades,
- direccion,
- metodo de pago,
- cobertura,
- horario,
- estado de tenant/sede.

### `pricing_engine`

Calcula:

- subtotal items,
- extras,
- descuentos/promociones permitidas,
- domicilio fijo,
- total final.

### `handoff_service`

Marca la conversacion como manual y crea una alerta para dashboard.

Casos iniciales:

- usuario pide asesor,
- usuario envia comprobante de transferencia,
- parser no entiende despues de varios intentos,
- validacion falla repetidamente,
- error externo critico,
- restaurante desactiva automatizacion.

## Idempotencia

Meta puede reenviar webhooks cuando:

- el endpoint tarda mucho,
- responde con error,
- hay problemas de red,
- Meta no confirma entrega del evento.

Sugerencia:

- guardar `provider_message_id` de WhatsApp en `messages`,
- crear indice unico por `tenant_id + provider + provider_message_id + direction`,
- si llega duplicado, responder 200 sin reprocesar,
- registrar evento `webhook.duplicate_ignored`.

## Fallas externas

Si falla OpenAI:

- mantener flujo guiado disponible,
- enviar respuesta simple pidiendo usar menu guiado o hablar con asesor,
- crear log `semantic_parser.failed`.

Si falla Supabase:

- responder 200 a Meta solo si el evento pudo registrarse o encolarse.
- Si no hay cola en MVP, responder error para permitir retry de Meta.

Si falla envio WhatsApp:

- guardar log `whatsapp.outbound_failed`,
- dejar conversacion en estado recuperable,
- alertar si es persistente.

## Automatizacion activa/inactiva

Cada tenant debe tener una bandera:

- `automation_enabled`

Si esta apagada:

- se registran mensajes,
- no se generan respuestas automaticas,
- se crean alertas de mensajes pendientes si aplica.

