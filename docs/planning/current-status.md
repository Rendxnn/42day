# Estado actual

Ultima actualizacion: 2026-04-29.

Referencia de handoff para continuar desde otro hilo:

- [thread-handoff.md](/mnt/c/Users/samir/Documents/freelance/42day/docs/planning/thread-handoff.md)
- [cloudflare-meta-token-and-deploy.md](/mnt/c/Users/samir/Documents/freelance/42day/docs/runbooks/cloudflare-meta-token-and-deploy.md)
- [deterministic-order-engine-plan.md](/mnt/c/Users/samir/Documents/freelance/42day/docs/planning/deterministic-order-engine-plan.md)
- [natural-conversation-implementation-plan.md](/mnt/c/Users/samir/Documents/freelance/42day/docs/planning/natural-conversation-implementation-plan.md)
- [dashboard-product-alignment-plan.md](/mnt/c/Users/samir/Documents/freelance/42day/docs/planning/dashboard-product-alignment-plan.md)
- [t-router-adoption-plan.md](/mnt/c/Users/samir/Documents/freelance/42day/docs/planning/t-router-adoption-plan.md)

## Logro principal

Se valido el primer flujo tecnico end-to-end:

```txt
WhatsApp tester
-> Meta WhatsApp Cloud API
-> Cloudflare Worker staging
-> Supabase control.webhook_events
-> respuesta automatica por WhatsApp
```

El primer bot validado respondio en WhatsApp con una respuesta basica de asistencia. El bot actual ya carga menu real y ante `hola` responde con saludo, menu publicado y sugerencias cortas.

Ejemplo conceptual:

```txt
Hola, soy el asistente de pedidos de Restaurante Demo. Como vas?

Este es el menu de hoy de Restaurante Demo:
1. ...

Escribe el numero del producto para agregarlo al pedido.
```

## Infraestructura configurada

### Supabase

Proyecto:

```txt
https://ggyhzxyrgbaykdwhtmqx.supabase.co
```

Configurado:

- schema `control`,
- schema `tenant_demo`,
- schema `tenant_arepas`,
- schema `tenant_pizza`,
- tenant demo activo,
- sede demo,
- canal WhatsApp demo registrado,
- bucket privado `payment-proofs`,
- bucket publico `product-images`,
- grants para Data API,
- indices de foreign keys,
- RLS activado en tablas expuestas por PostgREST,
- RLS activado tambien en schemas demo del dashboard.

Canal demo:

```txt
phone_number_id = 1051363798067045
waba_id = 1491008919702313
display_phone_number = +1 555 638 6291
```

### Cloudflare Workers

Worker staging desplegado:

```txt
https://42day-api-staging.42day.workers.dev
```

Configurado:

- secrets de Meta,
- secrets de Supabase,
- `APP_ENV=staging`,
- `META_GRAPH_API_VERSION=v22.0`.

### Meta Developers

Configurado:

- app Meta Developers,
- WhatsApp Cloud API,
- numero tester verificado,
- webhook apuntando al Worker staging,
- suscripcion al evento `messages`.

## Codigo implementado

Backend:

- Hono + Cloudflare Workers,
- `GET /health`,
- `GET /webhooks/whatsapp`,
- `POST /webhooks/whatsapp`,
- verificacion de webhook Meta,
- normalizacion inicial de payload WhatsApp,
- registro raw en `control.webhook_events`,
- idempotencia inicial por `provider_message_id`,
- resolucion de tenant desde `control.tenant_channels`,
- creacion/busqueda de customer por telefono,
- creacion/carga de conversation activa,
- timeout de conversation a 30 minutos,
- guardado de inbound/outbound en `tenant_demo.messages`,
- normalizacion de mensajes tipo ubicacion de WhatsApp,
- almacenamiento de ubicaciones WhatsApp en `tenant_demo.customer_addresses`,
- marcado de webhook procesado,
- envio outbound basico por WhatsApp,
- lectura del menu publicado del dia desde Supabase,
- respuesta `menu` real por WhatsApp con lista numerada,
- seleccion guiada por numero, texto con cantidad simple o frase determinista multi-item basica,
- creacion/persistencia inicial de `draft_orders`,
- agregado de items a `draft_order_items`,
- `conversation.context` y `clarification_attempts`,
- seleccion determinista de `delivery/pickup`,
- captura de direccion por texto o ubicacion,
- seleccion de pago,
- resumen final determinista,
- creacion de `orders` y `order_items`,
- alertas `order_pending_confirmation` y `transfer_payment_review`,
- trazabilidad del mecanismo de respuesta en `messages.payload.internal.routing`,
- cliente REST minimo para Supabase.

Flujo guiado actual validable en codigo:

```txt
hola/menu
-> muestra menu real
-> usuario selecciona item por numero o texto con cantidad simple
-> draft_order + item
-> pregunta delivery/pickup
-> direccion si delivery
-> metodo de pago
-> resumen
-> confirmacion del cliente
-> order + order_items + alerta operativa
```

Dashboard:

- app `apps/dashboard` integrada al monorepo,
- React + Vite + Tailwind,
- rutas `/dashboard/*` en `apps/api`,
- CRUD basico de productos,
- CRUD basico de menu del dia,
- rutas base para modulo de ordenes y alertas,
- toggle API para activar/desactivar automatizacion,
- upload de imagen de producto,
- cliente frontend ya tiene funciones para ordenes, alertas y automatizacion,
- UI actual se concentra en menu/catalogo/subida; aun no existe consola visual completa de ordenes, alertas y conversacion,
- tenant demo `demo`,
- tenants demo adicionales `arepas` y `pizza`.

Paquetes compartidos:

- `@42day/types`,
- `@42day/core`,
- `@42day/config`,
- `@42day/db`.

Router IA:

- `packages/t-router` existe dentro del workspace.
- `apps/api` depende de `@rendxnn/t-router` via `workspace:*`.
- El plan de extraerlo a dependencia remota/versionada sigue pendiente.

## Verificacion actual

Comando validado:

```bash
corepack pnpm typecheck:direct
```

Resultado:

```txt
sin errores
```

Query de verificacion en Supabase:

```sql
select
  id,
  provider,
  event_id,
  provider_message_id,
  phone_number_id,
  status,
  error_message,
  received_at
from control.webhook_events
order by received_at desc
limit 20;
```

Resultado observado:

- webhooks recientes con `status = processed`,
- `customer` persistido,
- `conversation` activa con expiracion a 30 minutos,
- inbound y outbound guardados en `tenant_demo.messages`,
- outbound recientes con `status = sent`,
- ubicaciones WhatsApp guardadas en `tenant_demo.customer_addresses`.

## Limitaciones actuales

La persistencia de `customers`, `conversations`, `messages`, `customer_addresses` y `processed_at` ya esta implementada y validada.

Ya se aplicaron en Supabase:

- migracion `dashboard_product_images`,
- migracion `test_tenants_arepas_pizza`,
- migracion `product_images_bucket`,
- migracion `business_config_and_addresses`,
- migracion `enable_rls_for_exposed_tables`,
- migracion `enable_rls_for_dashboard_demo_tenants`,
- migracion `order_console_and_conversation_context`,
- migracion `extend_product_options_for_deterministic_configurables`,
- migracion `ai_provider_config_and_aliases`,
- migracion `enable_rls_ai_provider_config`,
- seed `menu_demo.sql`.

Todavia no existe:

- parser semantico completo para configurables con validacion de opciones; ya existe fallback Gemini por `GEMINI_API_KEY` para extraer textos + confianza,
- descarga/subida real de comprobantes en conversacion,
- confirmacion operativa completa desde dashboard,
- manejo operativo completo de producto agotado al confirmar.

Limitaciones conversacionales actuales:

- el parser LLM aun no valida opciones configurables contra `product_options`,
- no se descargan ni almacenan archivos de comprobante desde Meta,
- los aliases existen en BD, pero todavia no tienen UI de dashboard,
- falta suite automatizada de pruebas conversacionales,
- el flujo de cambio de pedido confirmado aun debe pasar a humano con mas contexto operativo.

Mejoras conversacionales ya implementadas:

- despues de agregar productos el flujo queda en `awaiting_more_items` y pregunta si el cliente quiere agregar algo mas antes de pedir entrega,
- Gemini puede apoyar pedidos naturales en estados activos del pedido, no solo en la seleccion inicial,
- el router procesa multiples productos devueltos por el parser semantico,
- sin Gemini configurado, el matcher determinista ya puede resolver frases multi-item simples separadas por `y`, `tambien`, `ademas` o coma,
- se corrigio la extraccion de cantidades escritas para tomar el primer numero que aparece en la frase,
- el draft soporta quitar, reemplazar y ajustar cantidades desde acciones semanticas iniciales,
- los saludos durante un pedido activo conservan el contexto del pedido.

Observabilidad conversacional:

- cada respuesta outbound guarda metadata interna en `messages.payload.internal.routing`,
- `responseSource` indica `deterministic`, `llm` o `deterministic_after_llm_fallback`,
- `llm` registra si Gemini se intento, si se uso, outcome, intent, confianza y conteo de items/acciones,
- esto permite auditar una conversacion real mensaje por mensaje sin depender solo de logs del Worker.

Herramientas operativas:

- `scripts/powershell/Set-MetaAccessToken.ps1` actualiza `META_ACCESS_TOKEN` en Cloudflare,
- `scripts/powershell/Set-GeminiApiKey.ps1` actualiza `GEMINI_API_KEY` en Cloudflare,
- `scripts/powershell/Set-CfWorkerSecret.ps1` permite actualizar cualquier secret del Worker.

## Siguiente objetivo tecnico

Mejorar el flujo guiado real para que sea mas natural sin perder determinismo.

Secuencia recomendada:

1. Alinear documentacion y contratos con el estado actual.
2. Probar staging con `GEMINI_API_KEY` real y revisar `messages.payload.internal.routing`.
3. Completar validacion de configurables contra `product_options`.
4. Agregar tests unitarios/conversacionales para el router.
5. Implementar descarga/subida real de comprobantes de transferencia.
6. Implementar consola visual de ordenes/alertas/conversacion en dashboard.
7. Implementar producto agotado al confirmar y retoma de conversacion.

## Siguiente objetivo de producto

Probar un flujo guiado minimo natural:

```txt
usuario escribe hola
-> bot muestra menu real de hoy y pregunta de forma natural que quiere pedir
-> usuario elige item o escribe `2 menu del dia con sopa de frijoles`
-> bot crea o actualiza draft_order
-> bot pregunta si quiere agregar algo mas o seguir con entrega
-> bot pide delivery/pickup
-> bot pide direccion si aplica
-> bot pide pago
-> bot muestra resumen
-> bot crea order al confirmar
```

## Decisiones pendientes

Necesitamos definir o aterrizar:

- reglas iniciales de promociones,
- integracion de comprobantes y media,
- schema final de productos configurables y aliases en dashboard,
- umbrales finales para fallback LLM vs aclaracion humana.

Decisiones aclaradas:

- proveedor LLM inicial: Gemini,
- configuracion LLM por tenant en `control.tenant_ai_provider_configs`,
- credenciales cifradas a nivel aplicacion; clave maestra como secret del backend,
- salida del parser semantico: textos + confianza, sin IDs ni precios,
- aliases inicialmente en BD; luego se administraran desde dashboard.
