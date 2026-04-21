# Plan de implementacion backend

## Fase 1: base tecnica

Crear:

- `apps/api/package.json`
- `apps/api/wrangler.toml`
- `apps/api/src/index.ts`
- `apps/api/src/routes/health.ts`
- `apps/api/src/routes/whatsapp.ts`
- `packages/config/src/env.ts`
- `packages/types/src/whatsapp.ts`

Objetivo:

- tener worker ejecutando,
- tener healthcheck,
- verificar webhook de Meta.

## Fase 2: Supabase y DB

Crear:

- schema Drizzle,
- migraciones `control`,
- migraciones tenant,
- seed `tenant_demo`.

Objetivo:

- guardar raw webhook,
- guardar mensajes inbound,
- resolver tenant demo.

## Fase 3: outbound WhatsApp

Crear:

- `whatsapp_client`,
- envio de texto,
- envio de botones,
- logging outbound,
- manejo de errores.

Objetivo:

- responder automaticamente al primer mensaje.

## Fase 4: conversaciones

Crear:

- `conversation_service`,
- estados iniciales,
- timeout 30 min,
- router basico.

Objetivo:

- mantener estado entre mensajes.

## Fase 5: menu y draft

Crear:

- queries de menu activo,
- draft order,
- draft items,
- pricing con domicilio fijo,
- validacion basica.

Objetivo:

- pedido guiado end-to-end.

## Fase 6: parser semantico

Crear:

- prompt V1,
- schema JSON de salida,
- llamada LLM,
- validacion posterior.

Objetivo:

- convertir texto libre simple a draft validado.

## Fase 7: dashboard API

Crear endpoints para:

- ordenes,
- alertas,
- productos,
- combos,
- promociones,
- menu del dia.

Objetivo:

- permitir conexion real con dashboard.

