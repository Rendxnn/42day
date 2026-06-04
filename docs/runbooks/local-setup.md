# Setup local

## Estado actual

El repo ya tiene implementacion inicial de API, dashboard, persistencia conversacional y flujo guiado.

## Requisitos recomendados

- Node.js 20 o superior.
- pnpm.
- Cuenta Supabase.
- Cuenta Meta Developers.
- Cuenta Cloudflare.

Si `pnpm` no esta disponible pero Node trae Corepack:

```bash
corepack pnpm --version
corepack pnpm install
```

## Instalacion inicial

Cuando se empiece implementacion:

```bash
pnpm install
```

Alternativa si no existe el shim directo de pnpm:

```bash
corepack pnpm install
```

## Variables de entorno

El repo tiene tres capas de configuracion local:

- `.env` en la raiz como referencia general del proyecto,
- `apps/api/.dev.vars` para `wrangler dev`,
- `apps/dashboard/.env` o `apps/dashboard/.env.local` para Vite.

Copiar:

```bash
cp .env.example .env
cp apps/api/.dev.vars.example apps/api/.dev.vars
cp apps/dashboard/.env.example apps/dashboard/.env
```

Completar al menos estas variables en `apps/api/.dev.vars`:

```txt
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Completar al menos estas variables en `apps/dashboard/.env`:

```txt
VITE_API_BASE_URL
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Variables del proyecto raiz (`.env`):

```txt
META_VERIFY_TOKEN
META_ACCESS_TOKEN
META_PHONE_NUMBER_ID
META_WABA_ID
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
OPENAI_API_KEY
GEMINI_API_KEY
GEMINI_MODEL
AI_CONFIG_ENCRYPTION_KEY
```

## Supabase

Pasos:

1. Crear proyecto en Supabase.
2. Guardar URL y keys.
3. Crear schema `control`.
4. Crear schema `tenant_demo`.
5. Correr migraciones cuando existan.
6. Crear usuario demo.
7. Crear tenant demo.
8. Asociar usuario demo con tenant.

## Meta Developers

Pasos:

1. Crear app.
2. Agregar producto WhatsApp.
3. Copiar phone number ID y WABA ID.
4. Configurar token.
5. Agregar telefono personal como receptor de prueba.
6. Configurar webhook con URL publica.

## URL publica para webhook

Opciones:

- desplegar a Cloudflare Workers staging,
- usar Cloudflare Tunnel,
- usar ngrok.

Recomendacion: usar staging en Cloudflare Workers para pruebas reales de Meta.

## Primer smoke test

Cuando exista implementacion:

1. `GET /health` responde ok.
2. Meta verifica `GET /webhooks/whatsapp`.
3. Enviar mensaje desde telefono de prueba.
4. Confirmar que aparece en `webhook_events`.
5. Confirmar que aparece en `messages`.
6. Confirmar que se resolvio tenant demo.
7. Confirmar que se envio respuesta automatica basica.

## Guia completa

Ver [external-configuration-step-by-step.md](./external-configuration-step-by-step.md).
