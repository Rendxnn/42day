# Cloudflare Worker setup

## Objetivo

Crear el ambiente publico donde Meta enviara webhooks de WhatsApp.

El flujo esperado es:

```txt
Meta WhatsApp -> Cloudflare Worker -> Supabase -> WhatsApp outbound
```

## Que debes hacer tu

Por ahora no tenemos MCP de Cloudflare disponible en esta sesion. Si existe un MCP oficial o compatible para tu cuenta, podriamos configurarlo despues, pero el camino mas directo ahora es usar Wrangler.

Tareas manuales tuyas:

- crear cuenta Cloudflare si no la tienes,
- autenticar Wrangler con tu cuenta,
- cargar secrets reales,
- desplegar staging,
- copiar la URL publica del Worker,
- pegar esa URL en Meta Developers como webhook callback.

## 1. Login en Cloudflare

Desde la raiz del repo:

```bash
corepack pnpm --filter @42day/api exec wrangler login
```

Esto abre el navegador. Acepta el acceso de Wrangler.

## 2. Verificar localmente

Crear variables locales:

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

Completa `apps/api/.dev.vars` con:

```txt
APP_ENV=local
APP_BASE_URL=http://localhost:8787

META_VERIFY_TOKEN=<un-token-que-tu-elijas>
META_ACCESS_TOKEN=<meta-access-token>
META_PHONE_NUMBER_ID=<meta-phone-number-id>
META_WABA_ID=<meta-waba-id>
META_GRAPH_API_VERSION=v22.0

SUPABASE_URL=https://ggyhzxyrgbaykdwhtmqx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-de-supabase>
```

Levantar Worker local:

```bash
corepack pnpm --filter @42day/api dev
```

Probar health:

```bash
curl http://localhost:8787/health
```

Probar verify webhook:

```bash
curl "http://localhost:8787/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<META_VERIFY_TOKEN>&hub.challenge=test123"
```

Debe responder:

```txt
test123
```

## 3. Cargar secrets en staging

```bash
corepack pnpm --filter @42day/api exec wrangler secret put META_VERIFY_TOKEN --env staging
corepack pnpm --filter @42day/api exec wrangler secret put META_ACCESS_TOKEN --env staging
corepack pnpm --filter @42day/api exec wrangler secret put META_PHONE_NUMBER_ID --env staging
corepack pnpm --filter @42day/api exec wrangler secret put META_WABA_ID --env staging
corepack pnpm --filter @42day/api exec wrangler secret put SUPABASE_URL --env staging
corepack pnpm --filter @42day/api exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env staging
```

Opcional por ahora:

```bash
corepack pnpm --filter @42day/api exec wrangler secret put SUPABASE_ANON_KEY --env staging
corepack pnpm --filter @42day/api exec wrangler secret put DATABASE_URL --env staging
corepack pnpm --filter @42day/api exec wrangler secret put OPENAI_API_KEY --env staging
```

## 4. Deploy staging

```bash
corepack pnpm --filter @42day/api exec wrangler deploy --env staging
```

Guarda la URL publica, por ejemplo:

```txt
https://42day-api-staging.<tu-subdominio>.workers.dev
```

## 5. Probar staging

```bash
curl https://<worker-staging-url>/health
```

```bash
curl "https://<worker-staging-url>/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<META_VERIFY_TOKEN>&hub.challenge=test123"
```

## 6. Configurar Meta webhook

En Meta Developers:

- Callback URL: `https://<worker-staging-url>/webhooks/whatsapp`
- Verify token: el valor de `META_VERIFY_TOKEN`
- Subscribe field: `messages`

## 7. Primera prueba real

Desde tu WhatsApp tester, escribe al numero demo:

```txt
hola
```

Resultado esperado:

- llega una fila a `control.webhook_events`,
- Worker responde por WhatsApp:

```txt
Hola, te ayudo con tu pedido. Puedes ver el menu, hacer pedido guiado, escribirlo como quieras o hablar con alguien del restaurante.
```

## Estado validado

Este smoke test ya fue validado en staging.

Worker:

```txt
https://42day-api-staging.42day.workers.dev
```

Canal:

```txt
phone_number_id = 1051363798067045
waba_id = 1491008919702313
display_phone_number = +1 555 638 6291
```

Supabase registra eventos en:

```txt
control.webhook_events
```

Logs esperados:

```txt
POST /rest/v1/webhook_events -> 201
```

## Nota sobre PowerShell

En PowerShell, usa `curl.exe` para probar endpoints HTTP.

Ejemplo:

```powershell
curl.exe https://42day-api-staging.42day.workers.dev/health
```

`curl` sin `.exe` puede ejecutar `Invoke-WebRequest`, que muestra una salida distinta.
