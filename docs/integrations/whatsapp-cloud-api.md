# WhatsApp Cloud API

## Que es

WhatsApp Cloud API es la API oficial de Meta para recibir y enviar mensajes de WhatsApp desde un backend.

Durante desarrollo usaremos el numero de prueba de Meta Developers.

## Piezas externas que debes configurar

En Meta Developers:

1. Crear app en Meta Developers.
2. Agregar producto WhatsApp.
3. Obtener:
   - `Phone number ID`,
   - `WhatsApp Business Account ID`,
   - token temporal o permanente,
   - numero de prueba.
4. Agregar telefonos de prueba permitidos.
5. Configurar webhook:
   - callback URL,
   - verify token,
   - eventos `messages`.

## Endpoints backend necesarios

### Verificacion

```txt
GET /webhooks/whatsapp
```

Meta envia:

- `hub.mode`
- `hub.challenge`
- `hub.verify_token`

Backend responde el `hub.challenge` si el token coincide con `META_VERIFY_TOKEN`.

### Recepcion

```txt
POST /webhooks/whatsapp
```

Backend debe:

1. recibir payload,
2. responder rapido,
3. guardar raw event,
4. normalizar mensaje,
5. evitar duplicados,
6. procesar conversacion,
7. enviar respuesta si aplica.

## Variables de entorno

```txt
META_VERIFY_TOKEN
META_ACCESS_TOKEN
META_PHONE_NUMBER_ID
META_WABA_ID
META_GRAPH_API_VERSION
```

## Replicar para clientes nuevos

Modelo futuro recomendado:

1. Cliente conecta o entrega acceso a su WhatsApp Business.
2. Se registra un nuevo tenant en `control.tenants`.
3. Se registra canal en `control.tenant_channels`.
4. Se crea schema del tenant: `tenant_<slug>`.
5. Se corren migraciones del schema tenant.
6. Se configura menu, domicilio, datos de transferencia y horarios.
7. Se valida webhook con mensajes de prueba.
8. Se activa `automation_enabled`.

## Durante desarrollo con numero demo

Inicialmente:

- un solo tenant demo,
- un solo `META_PHONE_NUMBER_ID`,
- un solo schema `tenant_demo`,
- telefonos permitidos configurados en Meta Developers.

Esto permite probar sin onboarding real de clientes.

## Mensajes interactivos

Para confirmaciones y opciones iniciales conviene usar botones o listas cuando sea posible.

Tambien se debe aceptar texto libre para:

- `si`,
- `confirmo`,
- `listo`,
- `no`,
- `cancelar`,
- `asesor`.

## Reintentos de Meta

Meta puede reenviar eventos si:

- el webhook no responde 2xx,
- la respuesta tarda demasiado,
- hubo error de red,
- Meta considera que el evento no fue entregado.

Por eso:

- no se debe crear una orden dos veces por el mismo mensaje,
- no se debe enviar dos veces la misma respuesta automatica si el inbound fue duplicado,
- se debe usar `provider_message_id` como clave de idempotencia.

## Desarrollo local

Para que Meta llame un backend local necesitas una URL publica.

Opciones:

- Cloudflare Tunnel,
- ngrok,
- deploy directo a Cloudflare Workers dev/staging.

Recomendacion: usar un ambiente `staging` en Cloudflare Workers lo antes posible para probar webhooks sin depender siempre del tunel local.

