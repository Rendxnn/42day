# 42day

Sistema multi-tenant de automatizacion de pedidos por WhatsApp para restaurantes pequenos y medianos.

## Objetivo actual

Dejar un flujo principal `demo-ready` para:

- recibir mensajes por WhatsApp Cloud API,
- mostrar menu real,
- tomar pedidos guiados o naturales simples,
- construir y persistir `draft_orders`,
- calcular totales en backend,
- pedir solo los datos faltantes,
- crear orden pendiente de revision del restaurante,
- operar aceptacion, agotados y notificaciones desde dashboard,
- permitir handoff a humano cuando el bot no debe continuar.

No es una meta de produccion completa todavia. El objetivo inmediato es poder grabar demos y habilitar pruebas controladas con posibles clientes.

## Estado resumido

Hoy el repo ya tiene:

- webhook de WhatsApp funcionando sobre Cloudflare Workers,
- persistencia de customers, conversations, messages, draft orders y orders en Supabase,
- router conversacional en experimento temporal de interpretacion semantica para todo texto del cliente, con validacion deterministica de negocio,
- dashboard operativo para menu, catalogo, pedidos, aceptacion, agotados y control de automatizacion por conversacion,
- consola admin para provisionar restaurantes y miembros,
- notificaciones operativas basicas por pedidos.

Los huecos principales para el siguiente tramo son:

- consola humana de alertas/conversacion,
- alerta por cada mensaje nuevo recibido mientras una conversacion ya esta pausada,
- rechazo formal de comprobantes con solicitud de reenvio,
- pruebas automatizadas conversacionales mas amplias.

## Desarrollo local rapido

Levantar API y dashboard:

```bash
python scripts/dev_services.py --start
```

Ver estado:

```bash
python scripts/dev_services.py --status
```

Tumbar servicios:

```bash
python scripts/dev_services.py --stop
```

Reiniciar:

```bash
python scripts/dev_services.py --restart
```

En Ubuntu tambien puedes usar los wrappers Bash:

```bash
bash scripts/bash/show-helpers.sh
bash scripts/bash/install-workspace-deps.sh --force
bash scripts/bash/start-local-stack.sh
bash scripts/bash/tail-worker-logs.sh --environment staging
bash scripts/bash/set-meta-phone-number-id.sh --environment staging
```

URLs locales:

- Dashboard: `http://localhost:5173`
- API: `http://127.0.0.1:8787`

Logs:

```txt
.dev-logs/api.log
.dev-logs/api.err.log
.dev-logs/dashboard.log
.dev-logs/dashboard.err.log
```

Importante para login/dashboard:

- el Worker local lee secretos desde `apps/api/.dev.vars`,
- Vite lee variables desde `apps/dashboard/.env` o `apps/dashboard/.env.local`,
- en despliegue el backend debe permitir el origen web usando `DASHBOARD_ALLOWED_ORIGINS`,
- el archivo raiz `.env` no reemplaza esos archivos en runtime local.

## Estructura

```txt
apps/
  api/                 # Cloudflare Workers + Hono
  dashboard/           # App web del dashboard

packages/
  core/                # Logica pura de dominio
  db/                  # Schema, migraciones y clientes DB
  types/               # Tipos compartidos
  config/              # Configuracion y validacion de env
  prompts/             # Reservado para prompts versionados
  t-router/            # Router IA vendorizado temporalmente

docs/
  architecture/
  flows/
  integrations/
  planning/
  runbooks/
  schemas/
```

## Documentacion principal

La documentacion se organiza por responsabilidad: `PROJECT_CONTEXT.md` define producto y decisiones vigentes; `docs/planning/current-status.md` describe el estado funcional; `docs/architecture/*` define limites tecnicos; y `docs/runbooks/*` contiene procedimientos operativos. Si hay conflicto, prevalece esa fuente especializada y debe corregirse la duplicacion.

- [Contexto del proyecto](./PROJECT_CONTEXT.md)
- [Estandar de ingenieria y estructura del monorepo](./docs/architecture/monorepo.md)
- [Estado actual](./docs/planning/current-status.md)
- [Scope congelado demo-ready](./docs/planning/business-decisions.md)
- [Gap analysis demo-ready](./docs/planning/demo-ready-gap-analysis.md)
- [Plan conversacional natural + IA](./docs/planning/natural-conversation-implementation-plan.md)
- [Arquitectura backend](./docs/architecture/backend.md)
- [Onboarding de nuevos clientes](./docs/architecture/tenant-onboarding.md)
- [Flujo conversacional](./docs/flows/conversation-flow.md)
- [Handoff humano](./docs/flows/handoff.md)
- [Gestion admin de restaurantes](./docs/planning/admin-restaurant-management.md)
- [Notificaciones operativas](./docs/planning/realtime-order-notifications.md)
- [Supabase vs Cloudflare Workers](./docs/architecture/runtime-responsibilities.md)
- [WhatsApp Cloud API](./docs/integrations/whatsapp-cloud-api.md)
- [Supabase](./docs/integrations/supabase.md)
- [Schema de base de datos V1](./docs/schemas/database-v1.md)
- [Logging y monitoreo](./docs/schemas/logging-events.md)
- [Setup local](./docs/runbooks/local-setup.md)
- [Configuracion externa paso a paso](./docs/runbooks/external-configuration-step-by-step.md)
- [Cloudflare Worker setup](./docs/runbooks/cloudflare-worker-setup.md)
- [Prueba manual persistente](./docs/runbooks/first-persistent-flow-test.md)
