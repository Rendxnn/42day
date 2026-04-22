# 42day

Sistema multi-tenant de automatizacion de pedidos por WhatsApp para restaurantes pequenos y medianos.

## Objetivo del MVP

Construir una base seria para:

- recibir mensajes por WhatsApp Cloud API,
- interpretar pedidos guiados o libres,
- validar el pedido contra el menu activo,
- calcular totales en codigo,
- pedir datos faltantes,
- confirmar el pedido antes de crearlo,
- mostrar ordenes e intervenciones humanas en dashboard,
- permitir handoff a humano.

## Enfoque actual

Por ahora el foco del backend es:

- estructura del monorepo,
- documentacion funcional y tecnica,
- integracion WhatsApp Cloud API,
- recepcion, normalizacion y logging de mensajes,
- base logica para enrutar conversaciones,
- preparacion de Supabase Postgres como fuente de datos.

El frontend/dashboard lo trabaja otro integrante del equipo y debe vivir en `apps/dashboard`.

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
  prompts/             # Prompts versionados para parser semantico

docs/
  architecture/
  flows/
  integrations/
  planning/
  runbooks/
  schemas/
```

## Documentacion principal

- [Contexto del proyecto](./PROJECT_CONTEXT.md)
- [Estado actual](./docs/planning/current-status.md)
- [Estructura del monorepo](./docs/architecture/monorepo.md)
- [Arquitectura backend](./docs/architecture/backend.md)
- [Supabase vs Cloudflare Workers](./docs/architecture/runtime-responsibilities.md)
- [Onboarding de nuevos clientes](./docs/architecture/tenant-onboarding.md)
- [Flujo conversacional](./docs/flows/conversation-flow.md)
- [Handoff humano](./docs/flows/handoff.md)
- [WhatsApp Cloud API](./docs/integrations/whatsapp-cloud-api.md)
- [Supabase](./docs/integrations/supabase.md)
- [Schema de base de datos V1](./docs/schemas/database-v1.md)
- [Logging y monitoreo](./docs/schemas/logging-events.md)
- [Roadmap y division de tareas](./docs/planning/roadmap-and-task-split.md)
- [Plan de trabajo adelantable](./docs/planning/parallel-work-plan.md)
- [Setup local](./docs/runbooks/local-setup.md)
- [Configuracion externa paso a paso](./docs/runbooks/external-configuration-step-by-step.md)
- [Cloudflare Worker setup](./docs/runbooks/cloudflare-worker-setup.md)
