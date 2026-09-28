# ParaHoy

ParaHoy es una plataforma modular para restaurantes:

- **ParaHoy Pedidos:** automatización y operación de pedidos por WhatsApp.
- **ParaHoy Presencia Digital:** landing básica, carta pública y concierge IA.
- **Operación interna QR/NFC:** URLs permanentes, inventario físico paginado, configuración protegida y perfiles ligeros de negocio.
- **Perfil público personalizable:** la primera iteración local incluye paleta configurable, modo de iconos y avatar; consultar el estado actual por sus gates pendientes.
- **Agente de campo:** se especifica el flujo remoto con plugins separados por ambiente; todavía no está conectado a staging ni producción.
- **Paquete completo:** catálogo compartido y continuidad del carrito web en WhatsApp.

El repositorio conserva identificadores técnicos históricos como `42day` y `@42day`; la marca de producto es ParaHoy.

## Estado

Los dos módulos tienen caminos funcionales y se ofrecen mediante onboarding acompañado. Persisten brechas antes de considerarlos autoservicio o listos para escala. Consulta:

- [Contexto canónico del producto](./PROJECT_CONTEXT.md)
- [Estado actual, desalineaciones y prioridades](./docs/current-status.md)

## Desarrollo local

Requisitos: Node.js 22+, pnpm 9.15.0 y credenciales locales de los servicios usados.

```bash
pnpm install
pnpm --filter @42day/api dev
pnpm --filter @42day/dashboard dev
```

- Dashboard: `http://localhost:5173`
- API: `http://127.0.0.1:8787`

Validaciones principales:

```bash
pnpm typecheck
pnpm test
pnpm build
```

La preparación completa de variables, Supabase y Meta está en [Setup local](./docs/runbooks/local-setup.md).

## Flujo de desarrollo

ParaHoy usa GitHub Spec Kit con Codex. Todo cambio funcional se especifica, aclara y planea antes de
modificar código; después se implementa por fases verificadas y se contrasta con el SPEC hasta
converger.

- [Constitución](./.specify/memory/constitution.md)
- [Instrucciones para agentes](./AGENTS.md)
- [Arquitectura canónica](./ARCHITECTURE.md)
- [Estándar de código](./CODESTYLE.md)
- [Estrategia de pruebas](./TESTING.md)

El flujo completo se ejecuta en una tarea de Codex con `$speckit-specify`, `$speckit-clarify`,
`$speckit-plan`, `$speckit-checklist`, `$speckit-tasks`, `$speckit-analyze`, `$speckit-implement` y
`$speckit-converge`. Los artefactos de cada cambio viven en `specs/<número>-<feature>/`.

## Estructura

```text
apps/
  api/          Worker, webhooks y API de dashboard
  dashboard/    operación interna y páginas públicas
packages/       contratos y utilidades compartidas
supabase/       migraciones canónicas
docs/           arquitectura, flujos, integraciones y runbooks
.specify/       constitución, templates y scripts de Spec Kit
specs/          SPEC, planes, tareas y evidencia por feature
```

## Documentación

- [Arquitectura](./ARCHITECTURE.md)
- [Flujo de pedidos](./docs/flows/conversation-flow.md)
- [Presencia Digital](./docs/flows/presence-digital.md)
- [Auditoría documental QR/NFC](./docs/documentation-audit-qr-nfc.md)
- [Despliegue](./docs/runbooks/deployment.md)
- [Smoke tests](./docs/runbooks/smoke-tests.md)
- [Operación del agente de prospectos](./docs/runbooks/remote-prospect-agent.md)
- [Especificación de apariencia del perfil](./specs/013-brandable-business-profiles/spec.md)
- [Especificación del agente de campo remoto](./specs/014-parahoy-remote-field-agent/spec.md)
- [Plan original y continuidad de QR/NFC, perfiles y agente remoto](./docs/plans/qr-nfc-profiles-and-remote-agent.md)
