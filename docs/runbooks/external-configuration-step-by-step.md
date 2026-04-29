# Configuracion externa paso a paso

Esta guia deja el camino completo para probar por primera vez:

```txt
WhatsApp demo Meta -> Cloudflare Worker -> Supabase -> respuesta automatica WhatsApp
```

## Estado actual del codigo

Ya existe:

- `GET /health`
- `GET /webhooks/whatsapp`
- `POST /webhooks/whatsapp`
- normalizacion inicial de mensajes WhatsApp,
- registro raw de webhooks en `control.webhook_events`,
- idempotencia inicial por `provider_message_id`,
- resolucion temporal del tenant demo por `META_PHONE_NUMBER_ID`,
- respuesta outbound basica por WhatsApp.

Estado real validado:

- Worker staging desplegado en `https://42day-api-staging.42day.workers.dev`,
- Meta webhook conectado,
- mensajes WhatsApp entrantes guardados en `control.webhook_events`,
- respuesta automatica basica entregada por WhatsApp.

Todavia no existe:

- guardado del mensaje normalizado en `tenant_demo.messages`,
- flujo conversacional completo,
- descarga/subida real de comprobantes,
- parser semantico,
- dashboard API.

## 0. Precondiciones locales

Desde la raiz del repo:

```bash
node --version
corepack pnpm --version
corepack pnpm install
corepack pnpm typecheck:direct
```

Resultado esperado:

- `node` version 20 o superior.
- `corepack pnpm typecheck:direct` termina sin errores.

Si tienes `pnpm` instalado globalmente, tambien puedes usar:

```bash
pnpm install
pnpm typecheck:direct
```

## 1. Crear proyecto en Supabase

1. Entrar a `https://supabase.com/dashboard`.
2. Crear una organizacion si aun no existe.
3. Click en `New project`.
4. Completar:
   - Organization: la que vayan a usar.
   - Project name: `42day-staging` o similar.
   - Database password: generar una password fuerte y guardarla.
   - Region: elegir la mas cercana a los usuarios/operacion. Para Colombia, normalmente una region en Estados Unidos suele ser razonable si no hay una mas cercana disponible.
   - Pricing plan: Free sirve para pruebas iniciales.
5. Click en crear proyecto.
6. Esperar a que el proyecto termine de provisionar.

## 2. Copiar credenciales de Supabase

En el proyecto Supabase:

1. Ir a `Project Settings`.
2. Entrar a `API`.
3. Copiar:
   - `Project URL` -> `SUPABASE_URL`
   - `anon public` -> `SUPABASE_ANON_KEY`
   - `service_role` -> `SUPABASE_SERVICE_ROLE_KEY`

Luego:

1. Ir a `Project Settings`.
2. Entrar a `Database`.
3. Buscar `Connection string`.
4. Copiar la connection string URI para `DATABASE_URL`.
5. Reemplazar `[YOUR-PASSWORD]` por la password de la DB.

Mapeo:

```txt
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-public-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@...
```

Regla importante:

- `SUPABASE_ANON_KEY` puede vivir en frontend si hay RLS.
- `SUPABASE_SERVICE_ROLE_KEY` solo backend. Nunca en dashboard/frontend.

## 3. Ejecutar migraciones SQL

En Supabase:

1. Ir a `SQL Editor`.
2. Click en `New query`.
3. Abrir en tu editor local el primer archivo:

```txt
packages/db/migrations/0001_control_schema.sql
```

4. Copiar todo el contenido.
5. Pegar en SQL Editor.
6. Click en `Run`.
7. Confirmar que no hay errores.

Repetir en este orden exacto:

```txt
packages/db/migrations/0001_control_schema.sql
packages/db/migrations/0002_tenant_demo_schema.sql
packages/db/migrations/0003_tenant_demo_orders_and_messages.sql
packages/db/migrations/0004_api_grants_storage_bucket.sql
packages/db/migrations/0005_foreign_key_indexes.sql
packages/db/seeds/tenant_demo.sql
```

## 4. Verificar que la DB quedo creada

En Supabase:

1. Ir a `Table Editor`.
2. Buscar schema `control`.
3. Confirmar tablas:
   - `tenants`
   - `tenant_channels`
   - `tenant_users`
   - `webhook_events`
4. Buscar schema `tenant_demo`.
5. Confirmar tablas principales:
   - `locations`
   - `products`
   - `combos`
   - `combo_items`
   - `menus`
   - `menu_items`
   - `customers`
   - `conversations`
   - `messages`
   - `draft_orders`
   - `orders`
   - `payment_proofs`
   - `human_intervention_alerts`
   - `app_events`

Validar seed:

```sql
select * from control.tenants;
select * from tenant_demo.locations;
```

Resultado esperado:

- existe un tenant con `slug = demo`,
- existe una sede principal en `tenant_demo.locations`.

## 5. Exponer schemas en Supabase API

El Worker inicial usa la REST API de Supabase para insertar en `control.webhook_events`.

En Supabase:

1. Ir a `Project Settings`.
2. Entrar a `API`.
3. Buscar `Exposed schemas`.
4. Agregar:

```txt
control
tenant_demo
```

5. Guardar cambios.

Segun la documentacion oficial de Supabase, los custom schemas deben agregarse en `Exposed schemas` para usarse desde Data API, y tambien requieren grants para los roles que los van a usar.

## 6. Aplicar grants para Data API

Estos grants ya viven en:

```txt
packages/db/migrations/0004_api_grants_storage_bucket.sql
```

Si se ejecutaron las migraciones en orden, este paso ya quedo aplicado.

Referencia del SQL aplicado:

```sql
grant usage on schema control to anon, authenticated, service_role;
grant all on all tables in schema control to anon, authenticated, service_role;
grant all on all routines in schema control to anon, authenticated, service_role;
grant all on all sequences in schema control to anon, authenticated, service_role;
alter default privileges for role postgres in schema control grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema control grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema control grant all on sequences to anon, authenticated, service_role;

grant usage on schema tenant_demo to anon, authenticated, service_role;
grant all on all tables in schema tenant_demo to anon, authenticated, service_role;
grant all on all routines in schema tenant_demo to anon, authenticated, service_role;
grant all on all sequences in schema tenant_demo to anon, authenticated, service_role;
alter default privileges for role postgres in schema tenant_demo grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema tenant_demo grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema tenant_demo grant all on sequences to anon, authenticated, service_role;
```

Nota de seguridad:

- Esto es suficiente para staging usando `service_role`.
- Antes de permitir dashboard directo con `anon`, hay que definir RLS.
- Para operaciones sensibles, el dashboard deberia consumir nuestro API.

## 7. Crear bucket de comprobantes

En Supabase:

1. Ir a `Storage`.
2. Click en `Create bucket`.
3. Nombre:

```txt
payment-proofs
```

4. Mantenerlo privado.
5. Si Supabase muestra restricciones:
   - permitir imagenes y PDF si esta disponible,
   - tamano inicial sugerido: 10 MB o 20 MB.
6. Crear bucket.

Resultado esperado:

- bucket `payment-proofs` existe,
- no es publico.

La subida real de comprobantes aun no esta implementada, pero la DB y el bucket quedan listos.

## 8. Preparar variables locales

Para herramientas generales del repo, puedes crear `.env` local desde el ejemplo:

```bash
cp .env.example .env
```

Para `wrangler dev`, crear tambien el archivo local del Worker:

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

Completar en `apps/api/.dev.vars` al menos:

```txt
APP_ENV=local
APP_BASE_URL=http://localhost:8787

SUPABASE_URL=<Project URL>
SUPABASE_ANON_KEY=<anon public>
SUPABASE_SERVICE_ROLE_KEY=<service_role>
DATABASE_URL=<connection string>

META_VERIFY_TOKEN=<elige-un-token-propio>
META_GRAPH_API_VERSION=v22.0
```

Todavia no tendras estos hasta crear Meta:

```txt
META_ACCESS_TOKEN=
META_PHONE_NUMBER_ID=
META_WABA_ID=
```

`META_VERIFY_TOKEN` lo eliges tu. Ejemplo:

```txt
META_VERIFY_TOKEN=42day-dev-webhook-token
```

Ese mismo valor se pega luego en Meta al configurar el webhook.

Nota:

- `.env` sirve como referencia general del monorepo.
- `apps/api/.dev.vars` es el archivo que Wrangler usa para inyectar variables locales al Worker.
- Ambos archivos reales estan ignorados por Git.

## 9. Crear proyecto/app en Cloudflare

Desde la raiz del repo:

```bash
corepack pnpm --filter @42day/api exec wrangler login
```

Esto abre navegador para autenticar Cloudflare.

Luego probar local:

```bash
corepack pnpm --filter @42day/api dev
```

Resultado esperado:

- Wrangler levanta un dev server.
- Debes ver una URL local, normalmente `http://localhost:8787`.

En otra terminal:

```bash
curl http://localhost:8787/health
```

Respuesta esperada:

```json
{
  "ok": true,
  "service": "42day-api",
  "env": "local"
}
```

## 10. Probar verificacion de webhook local

Con el Worker local corriendo:

```bash
curl "http://localhost:8787/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<META_VERIFY_TOKEN>&hub.challenge=test123"
```

Respuesta esperada:

```txt
test123
```

Si responde `Forbidden`, revisar:

- que `META_VERIFY_TOKEN` exista en el entorno local,
- que el valor del query sea identico.

## 11. Desplegar Worker staging

Desplegar:

```bash
corepack pnpm --filter @42day/api exec wrangler deploy --env staging
```

Guardar la URL que entregue Cloudflare. Suele verse como:

```txt
https://42day-api-staging.<subdomain>.workers.dev
```

Probar:

```bash
curl https://<worker-staging-url>/health
```

## 12. Configurar secrets del Worker staging

Antes de conectar Meta, cargar secrets.

```bash
corepack pnpm --filter @42day/api exec wrangler secret put META_VERIFY_TOKEN --env staging
corepack pnpm --filter @42day/api exec wrangler secret put SUPABASE_URL --env staging
corepack pnpm --filter @42day/api exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env staging
```

Cuando ya tengas Meta, cargar tambien:

```bash
corepack pnpm --filter @42day/api exec wrangler secret put META_ACCESS_TOKEN --env staging
corepack pnpm --filter @42day/api exec wrangler secret put META_PHONE_NUMBER_ID --env staging
corepack pnpm --filter @42day/api exec wrangler secret put META_WABA_ID --env staging
```

Opcionales por ahora:

```bash
corepack pnpm --filter @42day/api exec wrangler secret put APP_BASE_URL --env staging
corepack pnpm --filter @42day/api exec wrangler secret put SUPABASE_ANON_KEY --env staging
corepack pnpm --filter @42day/api exec wrangler secret put DATABASE_URL --env staging
corepack pnpm --filter @42day/api exec wrangler secret put OPENAI_API_KEY --env staging
```

Despues de cargar secrets, redeploy:

```bash
corepack pnpm --filter @42day/api exec wrangler deploy --env staging
```

## 13. Crear app en Meta Developers

En Meta Developers:

1. Entrar a `https://developers.facebook.com/apps`.
2. Crear nueva app.
3. Elegir un tipo compatible con WhatsApp/Business.
4. Crear la app.
5. En el dashboard de la app, agregar producto `WhatsApp`.
6. Entrar a `WhatsApp -> API Setup`.
7. Copiar:
   - `Temporary access token` -> `META_ACCESS_TOKEN`
   - `Phone number ID` -> `META_PHONE_NUMBER_ID`
   - `WhatsApp Business Account ID` -> `META_WABA_ID`
8. En `To`, agregar tu numero personal como recipient/tester si Meta lo pide.
9. Verificar el codigo que Meta envie a tu WhatsApp.

Nota:

- El token temporal sirve para pruebas, pero expira.
- Para produccion necesitaremos token permanente con Business Manager/System User.

## 14. Guardar secrets de Meta en Cloudflare

```bash
corepack pnpm --filter @42day/api exec wrangler secret put META_ACCESS_TOKEN --env staging
corepack pnpm --filter @42day/api exec wrangler secret put META_PHONE_NUMBER_ID --env staging
corepack pnpm --filter @42day/api exec wrangler secret put META_WABA_ID --env staging
```

Redeploy:

```bash
corepack pnpm --filter @42day/api exec wrangler deploy --env staging
```

## 15. Insertar canal demo en Supabase

En Supabase SQL Editor:

```sql
insert into control.tenant_channels (
  tenant_id,
  provider,
  phone_number_id,
  waba_id,
  display_phone_number,
  status
)
select
  id,
  'whatsapp_cloud',
  '<META_PHONE_NUMBER_ID>',
  '<META_WABA_ID>',
  '<DISPLAY_PHONE_NUMBER>',
  'active'
from control.tenants
where slug = 'demo'
on conflict (provider, phone_number_id) do nothing;
```

Reemplazar:

- `<META_PHONE_NUMBER_ID>`
- `<META_WABA_ID>`
- `<DISPLAY_PHONE_NUMBER>`

Validar:

```sql
select
  t.slug,
  c.provider,
  c.phone_number_id,
  c.waba_id,
  c.status
from control.tenant_channels c
join control.tenants t on t.id = c.tenant_id;
```

Nota: el codigo actual todavia resuelve tenant por `META_PHONE_NUMBER_ID` desde env. Esta fila deja la DB lista para el siguiente paso de implementacion.

## 16. Configurar webhook en Meta

En Meta Developers:

1. Ir a la app.
2. Entrar a `WhatsApp`.
3. Buscar `Configuration` o `Webhooks`.
4. Click en configurar webhook.
5. Callback URL:

```txt
https://<worker-staging-url>/webhooks/whatsapp
```

6. Verify token:

```txt
<META_VERIFY_TOKEN>
```

7. Click en verificar/guardar.

Meta va a llamar el endpoint:

```txt
GET /webhooks/whatsapp?hub.mode=subscribe&hub.challenge=...&hub.verify_token=...
```

Resultado esperado:

- Meta acepta la URL.
- El webhook queda verificado.

Luego suscribir el campo:

```txt
messages
```

## 17. Probar verify manual en staging

Antes o despues de Meta:

```bash
curl "https://<worker-staging-url>/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<META_VERIFY_TOKEN>&hub.challenge=test123"
```

Debe responder:

```txt
test123
```

## 18. Primera prueba inbound/outbound

Desde tu WhatsApp personal autorizado como tester:

1. Escribir al numero demo de Meta.
2. Enviar:

```txt
hola
```

Resultado esperado:

1. Meta manda webhook al Worker.
2. Worker inserta raw payload en `control.webhook_events`.
3. Worker normaliza el mensaje.
4. Worker resuelve tenant demo usando `META_PHONE_NUMBER_ID`.
5. Worker responde con saludo y menu real. Ejemplo:

```txt
Hola, soy el asistente de pedidos de <nombre del restaurante>. Como vas?

Este es el menu de hoy de <nombre del restaurante>:
1. ...

Escribe el numero del producto para agregarlo al pedido.
```

Probar handoff simple:

```txt
quiero hablar con un asesor
```

Respuesta esperada:

```txt
Listo, te pasamos con alguien del restaurante para que te ayude.
```

## 19. Verificar que Supabase registro el webhook

En Supabase SQL Editor:

```sql
select
  provider,
  provider_message_id,
  phone_number_id,
  status,
  received_at
from control.webhook_events
order by received_at desc
limit 10;
```

Resultado esperado:

- aparece el mensaje recibido,
- `provider = whatsapp_cloud`,
- `provider_message_id` tiene valor,
- `status = received`.

## 20. Revisar logs del Worker

Para ver logs de staging:

```bash
corepack pnpm --filter @42day/api exec wrangler tail --env staging
```

Eventos esperados:

```txt
whatsapp.webhook.received
whatsapp.message.normalized
whatsapp.message.outbound_sent
```

Si llega duplicado:

```txt
whatsapp.webhook.duplicate_ignored
```

## 21. Smoke test completo

Checklist:

- [ ] `corepack pnpm typecheck:direct` pasa.
- [ ] Supabase tiene schemas `control` y `tenant_demo`.
- [ ] Supabase tiene tenant `demo`.
- [ ] Supabase tiene bucket privado `payment-proofs`.
- [ ] Supabase expone schemas `control` y `tenant_demo`.
- [ ] Worker staging responde `/health`.
- [ ] Worker staging responde challenge de webhook.
- [ ] Meta verifica webhook.
- [ ] Campo `messages` esta suscrito.
- [ ] Mensaje de WhatsApp llega al Worker.
- [ ] `control.webhook_events` recibe fila.
- [ ] Bot responde por WhatsApp.

## 22. Errores comunes

### Meta no verifica webhook

Revisar:

- la URL es HTTPS,
- ruta exacta: `/webhooks/whatsapp`,
- `META_VERIFY_TOKEN` coincide exactamente,
- secrets cargados en el environment correcto,
- hiciste redeploy despues de cargar secrets.

### Worker responde 500 al webhook

Revisar:

- `SUPABASE_URL`,
- `SUPABASE_SERVICE_ROLE_KEY`,
- schemas expuestos en Supabase API,
- grants del paso 6,
- tabla `control.webhook_events` existe.

### El mensaje entra pero no responde

Revisar:

- `META_ACCESS_TOKEN` vigente,
- `META_PHONE_NUMBER_ID` correcto,
- `META_WABA_ID` correcto,
- tu telefono esta autorizado como tester en Meta,
- logs de `wrangler tail`.

### Se registra en Supabase pero no resuelve tenant

Revisar:

- `phone_number_id` del webhook en `control.webhook_events`,
- valor de `META_PHONE_NUMBER_ID` en Cloudflare,
- que no hayas copiado el display phone number en vez del phone number ID.

### Duplicados

Es normal que Meta pueda reintentar. El codigo intenta evitar reprocesar eventos repetidos usando `provider_message_id` en `control.webhook_events`.

## 23. Siguiente implementacion despues del primer smoke test

Cuando el primer flujo funcione, seguir con:

1. Guardar mensaje normalizado en `tenant_demo.messages`.
2. Resolver tenant real desde `control.tenant_channels`.
3. Crear/buscar customer por telefono.
4. Crear conversacion activa.
5. Aplicar timeout de 30 minutos.
6. Cargar menu activo.
7. Responder opciones iniciales con botones/listas.
8. Empezar flujo guiado.
