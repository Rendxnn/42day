# Cloudflare, token Meta y deploy

Ultima actualizacion: 2026-04-27.

## Respuesta corta

Si sigues usando el token temporal que Meta te da en `WhatsApp > API Setup`, eventualmente vas a tener que cambiarlo otra vez cuando expire o se invalide.

Si cambias a un token mas estable de tipo `System User Access Token`, no deberias estar renovandolo en cada sesion de pruebas.

## Que estamos usando hoy

Hoy el backend esta desplegado como un **Cloudflare Worker**.

Archivo de configuracion:

- [apps/api/wrangler.toml](/mnt/c/Users/samir/Documents/freelance/42day/apps/api/wrangler.toml)

Ambiente desplegado hoy:

- `staging`
- URL: `https://42day-api-staging.42day.workers.dev`

## Donde viven las cosas

### En tu maquina

Viven:

- el codigo del backend,
- `wrangler.toml`,
- tu sesion autenticada de `wrangler login`,
- los comandos que usas para desplegar.

### En Cloudflare

Viven:

- el Worker desplegado,
- los secrets del ambiente (`META_ACCESS_TOKEN`, `SUPABASE_URL`, etc.),
- la URL `workers.dev`,
- las versiones desplegadas del backend.

### En Supabase

Viven:

- la base de datos,
- el storage,
- los schemas tenant,
- los datos operativos,
- el `service_role` y demas claves.

## Por que el deploy es tan facil ahora

Porque hoy estamos usando este modelo:

1. `wrangler login` deja autenticada tu maquina contra tu cuenta de Cloudflare.
2. `wrangler.toml` ya sabe:
   - nombre del Worker,
   - entrypoint,
   - ambientes (`staging`, `production`).
3. Los secrets ya viven guardados en Cloudflare.
4. `wrangler deploy --env staging` empaqueta el codigo y lo sube al Worker.

No hay servidor VPS, no hay SSH, no hay Docker, no hay Nginx, no hay pipeline obligatorio para este MVP.

## Token Meta: que debes entender

Meta maneja varios tipos de token para Graph API / WhatsApp Cloud API.

La documentacion oficial de Cloud API indica que la API soporta:

- `System User Access Tokens`
- `Business Integration System User Access Tokens`
- `User Access Tokens`

Fuente oficial:

- [Meta Cloud API Overview](https://meta-preview.mintlify.io/docs/whatsapp/cloud-api/overview)

En la practica para tu caso:

- si tomas el token temporal del panel de prueba de Meta, es normal tener que cambiarlo de vez en cuando;
- si luego generas un token estable de `System User`, dejas de depender de esa rotacion frecuente.

## Flujo rapido cuando el token actual falla

Sintoma tipico:

- inbound sigue entrando,
- pero outbound falla con error de autenticacion de Meta.

Paso a paso:

1. Ir a Meta Developers.
2. Entrar a `WhatsApp > API Setup`.
3. Copiar un token nuevo.
4. Actualizar el secret en Cloudflare.
5. Volver a desplegar el Worker.

## Comandos manuales

Desde Bash en la raiz del repo:

```bash
bash scripts/bash/set-meta-access-token.sh --environment staging
bash scripts/bash/deploy-api.sh --environment staging
```

## Scripts listos

Para Windows quedan en:

- [Set-CfWorkerSecret.ps1](/mnt/c/Users/samir/Documents/freelance/42day/scripts/powershell/Set-CfWorkerSecret.ps1)
- [Set-MetaAccessToken.ps1](/mnt/c/Users/samir/Documents/freelance/42day/scripts/powershell/Set-MetaAccessToken.ps1)
- [Deploy-Api.ps1](/mnt/c/Users/samir/Documents/freelance/42day/scripts/powershell/Deploy-Api.ps1)
- [Test-ApiHealth.ps1](/mnt/c/Users/samir/Documents/freelance/42day/scripts/powershell/Test-ApiHealth.ps1)
- [Show-Helpers.ps1](/mnt/c/Users/samir/Documents/freelance/42day/scripts/powershell/Show-Helpers.ps1)
- [Start-ApiDev.ps1](/mnt/c/Users/samir/Documents/freelance/42day/scripts/powershell/Start-ApiDev.ps1)
- [Start-DashboardDev.ps1](/mnt/c/Users/samir/Documents/freelance/42day/scripts/powershell/Start-DashboardDev.ps1)
- [Start-LocalStack.ps1](/mnt/c/Users/samir/Documents/freelance/42day/scripts/powershell/Start-LocalStack.ps1)
- [Publish-Staging.ps1](/mnt/c/Users/samir/Documents/freelance/42day/scripts/powershell/Publish-Staging.ps1)

Para Ubuntu quedan en:

- [show-helpers.sh](../../scripts/bash/show-helpers.sh)
- [install-workspace-deps.sh](../../scripts/bash/install-workspace-deps.sh)
- [set-cf-worker-secret.sh](../../scripts/bash/set-cf-worker-secret.sh)
- [set-meta-access-token.sh](../../scripts/bash/set-meta-access-token.sh)
- [set-gemini-api-key.sh](../../scripts/bash/set-gemini-api-key.sh)
- [deploy-api.sh](../../scripts/bash/deploy-api.sh)
- [test-api-health.sh](../../scripts/bash/test-api-health.sh)
- [start-api-dev.sh](../../scripts/bash/start-api-dev.sh)
- [start-dashboard-dev.sh](../../scripts/bash/start-dashboard-dev.sh)
- [start-local-stack.sh](../../scripts/bash/start-local-stack.sh)
- [publish-staging.sh](../../scripts/bash/publish-staging.sh)
- [publish-production.sh](../../scripts/bash/publish-production.sh)

## Tengo que cambiar el token dentro del deploy?

No exactamente.

La idea correcta es esta:

1. el token vive como **secret remoto** en Cloudflare,
2. cuando cambia o expira, actualizas ese secret,
3. luego haces deploy del backend para dejar el ambiente claramente sincronizado con el codigo actual.

O sea:

- el token no esta hardcodeado en el codigo,
- el deploy toma el secret que Cloudflare ya tiene guardado.

## Configuracion actual de despliegue

Hoy estamos usando:

- Cloudflare Workers
- ambiente `staging`
- nombre del Worker: `42day-api-staging`
- dominio temporal de Cloudflare: `workers.dev`

Configuracion actual en:

- [apps/api/wrangler.toml](/mnt/c/Users/samir/Documents/freelance/42day/apps/api/wrangler.toml)

## Como seria en productivo

Lo esperable en productivo es esto:

### Cloudflare

- ambiente `production`
- Worker `42day-api-production`
- dominio propio, por ejemplo:
  - `api.tudominio.com`
- secrets de produccion separados
- cuenta de Cloudflare controlada y no personal

### Meta

- no depender del token temporal del panel de prueba
- usar token mas estable de tipo `System User`
- ya no usar numero demo de prueba
- conectar numero real del negocio

### Supabase

- proyecto de produccion separado del staging
- claves separadas
- storage y base de datos separados
- backups y controles mas serios

### Operacion

- deploy con proceso mas controlado
- posiblemente script de release o CI/CD
- logs y alertas mas formales

## Publicar dashboard + worker en productivo

Estado actual del repo:

- el Worker ya resuelve CORS para `/dashboard/*` desde [apps/api/src/index.ts](../../apps/api/src/index.ts),
- el allowlist ya incluye `https://42day-dashboard.vercel.app` en `staging` y `production` en [apps/api/wrangler.toml](../../apps/api/wrangler.toml),
- por eso el trabajo operativo real es desplegar el Worker `production` y apuntar Vercel a esa URL.

### 1. Confirmar secrets de Cloudflare en `production`

Si falta algun secret o lo vas a rotar:

```bash
bash scripts/bash/set-cf-worker-secret.sh META_VERIFY_TOKEN --environment production
bash scripts/bash/set-cf-worker-secret.sh META_ACCESS_TOKEN --environment production
bash scripts/bash/set-cf-worker-secret.sh META_PHONE_NUMBER_ID --environment production
bash scripts/bash/set-cf-worker-secret.sh META_WABA_ID --environment production
bash scripts/bash/set-cf-worker-secret.sh SUPABASE_URL --environment production
bash scripts/bash/set-cf-worker-secret.sh SUPABASE_SERVICE_ROLE_KEY --environment production
```

Opcionales segun el ambiente:

```bash
bash scripts/bash/set-cf-worker-secret.sh SUPABASE_ANON_KEY --environment production
bash scripts/bash/set-cf-worker-secret.sh DATABASE_URL --environment production
bash scripts/bash/set-cf-worker-secret.sh GEMINI_API_KEY --environment production
```

### 2. Deploy del Worker productivo

Opcion directa:

```bash
bash scripts/bash/deploy-api.sh --environment production
```

Opcion con health check:

```bash
bash scripts/bash/publish-production.sh --base-url https://42day-api-production.42day.workers.dev
```

Si tu `workers.dev` real usa otro subdominio o un dominio custom, pasa esa URL en `--base-url`.

### 3. Verificar health y logs

Health:

```bash
bash scripts/bash/test-api-health.sh --base-url https://42day-api-production.42day.workers.dev
```

Logs:

```bash
bash scripts/bash/tail-worker-logs.sh --environment production
```

### 4. Configurar Vercel

En el proyecto del dashboard en Vercel, configurar:

```txt
VITE_API_BASE_URL=https://42day-api-production.42day.workers.dev
VITE_SUPABASE_URL=<supabase-url-produccion>
VITE_SUPABASE_ANON_KEY=<supabase-anon-key-produccion>
```

Si el Worker productivo usa otra URL publica, usar esa en `VITE_API_BASE_URL`.

### 5. Redeploy del dashboard en Vercel

Despues de guardar variables en Vercel:

- hacer redeploy del proyecto,
- abrir `https://42day-dashboard.vercel.app`,
- validar login,
- validar una llamada autenticada a `/dashboard/me`,
- validar que ya no haya errores CORS en navegador.

### 6. Smoke test final

Checklist minimo:

- `GET /health` responde en el Worker productivo,
- el dashboard desplegado carga contra `production`,
- `https://42day-dashboard.vercel.app` puede consultar `/dashboard/*`,
- Cloudflare logs muestran requests del frontend sin rechazo de CORS.

## Diferencia real entre hoy y produccion

Hoy:

- rapido,
- simple,
- depende de tu sesion local autenticada de Wrangler,
- usa numero demo,
- probablemente usa token temporal,
- ideal para iterar.

Produccion:

- separado por ambiente,
- con dominio real,
- con secretos estables,
- con numero real,
- con permisos mas controlados,
- con proceso de despliegue menos manual.
