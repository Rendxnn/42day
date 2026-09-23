# Plan de implementación: Administración de perfiles y acciones para agentes

**Branch actual**: `staging` | **Fecha**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

## Resumen

Evolucionar la ruta existente de perfiles a un inventario con paginación keyset, búsqueda, filtros y
ordenamiento; sustituir el editor aislado por una lista responsive con modal de creación/edición; y
añadir una frontera MCP privada para que ChatGPT prepare y, solo tras confirmación humana,
cree/publique un perfil y lo asigne atómicamente a un QR.

“Eliminar” será deshabilitación lógica mediante la operación atómica existente. No se expone
`DELETE`, no se borra historial y el agente no recibe una herramienta de retiro. El MCP vivirá en el
Worker existente, reutilizará el dominio y usará Supabase Auth como OAuth 2.1; no requiere una sesión
remota permanente en el Mac.

## Evidencia del estado actual

| Evidencia | Comportamiento verificado | Relevancia |
| --- | --- | --- |
| `business-profile-routes.ts` — `GET /admin/business-profiles` | Exige `system_admin`, sin parámetros. | Se evoluciona la ruta existente. |
| `business-profile-repository.ts:listBusinessProfiles` | Ordena por actualización y limita a 200. | Causa del inventario incompleto. |
| `BusinessProfileEditor.tsx` | Para editar exige pegar un UUID. | Pasará a modal abierto desde lista. |
| `App.tsx:BusinessProfileEditor` | Ya existe menú `Perfiles`. | Se completa; no se crea otra sección. |
| `business-profile-routes.ts:disable-and-suspend` | Deshabilitación y suspensión de QRs protegidas. | Implementa “eliminar” sin hard delete. |
| `dashboard/auth.ts:requireSystemAdmin` | Bearer de Supabase + rol administrativo. | Se conserva y refuerza para MCP. |
| `dynamic-links/admin-routes.ts` | Cursor opaco ligado a filtros y orden. | Patrón probado reutilizable. |
| `packages/types/src/business-profiles.ts` | Contratos compartidos, sin página/resumen. | Se amplía como fuente canónica. |

## Contexto técnico

- **Stack**: TypeScript 5.7, React 19, Hono 4, Cloudflare Workers, Supabase Postgres/Auth.
- **Dependencias nuevas evaluadas**: el diseño contemplaba `@modelcontextprotocol/sdk` y `jose`, pero el
  workspace no las tiene instaladas y el runtime de Worker no requiere un cliente SDK para este contrato.
  La primera implementación usa un adaptador JSON-RPC/MCP mínimo y WebCrypto/JWKS nativo, sin añadir
  dependencias ni alterar el lockfile. La revisión independiente debe verificar el protocolo, la firma
  asimétrica real y decidir si conviene adoptar SDKs en una iteración posterior.
- **Persistencia**: schemas `control` y `audit`; migraciones solo en `supabase/migrations`.
- **Pruebas**: `node:test`, Supabase local real, TypeScript, build Turbo y gate OAuth móvil en staging.
- **Rendimiento**: p95 inferior a 800 ms con 10 000 perfiles en staging.
- **Restricciones**: `system_admin`; cero acceso directo de UI/MCP a tablas; confirmación antes de
  escribir; revisión optimista; commit atómico e idempotente; URL permanente del QR inmutable; sin
  secretos/payloads completos en logs; producción requiere autorización posterior específica.
- **Escala**: páginas 25/50/100 y un perfil + un QR por confirmación del agente.

## Revisión constitucional

*Gate previo y posterior al diseño: aprobado sin excepciones.*

- Spec, investigación, modelo y contratos preceden al código.
- UI y agente delegan; solo el backend validado escribe.
- Las superficies son `system_admin`; no amplían acceso de managers ni schemas tenant.
- Tablas nuevas fuerzan RLS, revocan `anon/authenticated` y las funciones califican nombres.
- El modelo propone; preparar no escribe y confirmar ejecuta una acción estrecha e idempotente.
- No cambian `/p`, `/r` ni `/r/<code>` y no hay borrado físico.
- Se exige comportamiento observable, Supabase local y los gates de `TESTING.md`.
- Staging y producción conservan autorizaciones y despliegues independientes.

## Arquitectura objetivo

```text
Dashboard / Perfiles
  -> GET página (cursor + filtros + orden)
  -> abrir modal -> GET detalle fresco
  -> PATCH / publish / disable-and-suspend con revisión
  -> public-profile -> RPC/repositorio control -> auditoría

ChatGPT móvil
  -> OAuth 2.1 PKCE de Supabase Auth + consentimiento ParaHoy
  -> HTTPS /mcp en Worker
  -> herramientas read/prepare -> business-setup-agent
  -> confirmación visible
  -> commit(operationId, preparationToken)
  -> RPC: revalidar + crear/publicar perfil + asignar QR + auditar
  -> resultado estable e idempotente
```

### Responsabilidades

| Frontera | Dueño resultante | Razón |
| --- | --- | --- |
| Inventario y detalle | `public-profile` | Un dueño para lectura, búsqueda e impacto. |
| Lista/modal admin | `features/admin` | Conservar contexto y eliminar dependencia del UUID. |
| Orquestación perfil + QR | `business-setup-agent` | Coordinar features sin duplicar sus reglas. |
| Transporte agente | Adaptador MCP del Worker | Contrato estructurado y autenticado. |
| Identidad agente | OAuth/JWT con actor, audiencia y `client_id` | Trazabilidad y autorización por cliente. |

### Contratos y datos

- Evoluciona `GET /dashboard/admin/business-profiles`; conserva mutaciones y añade uso al detalle.
  Véase [business-profile-management-api.md](./contracts/business-profile-management-api.md).
- Cinco herramientas MCP de cuenta, lectura, preparación y confirmación; sin SQL ni borrado.
  Véase [parahoy-agent-tools.md](./contracts/parahoy-agent-tools.md).
- Nueva `control.business_setup_operations`, función paginada, índices medidos y RPC transaccional.
  RLS forzado, grants revocados y auditoría append-only. Véase [data-model.md](./data-model.md).
- El único cliente conocido del listado se actualiza junto al endpoint; mutaciones y URLs públicas
  permanecen compatibles.

## Árbol fuente objetivo

```text
[MODIFY] packages/types/src/business-profiles.ts
[MODIFY] packages/config/src/env.ts
[MODIFY] apps/api/package.json
[MODIFY] pnpm-lock.yaml
[MODIFY] apps/api/src/lib/bindings.ts
[MODIFY] apps/api/src/index.ts
[MODIFY] apps/api/src/features/public-profile/business-profile-routes.ts
[MODIFY] apps/api/src/features/public-profile/business-profile-repository.ts
[ADD]    apps/api/src/features/public-profile/business-profile-pagination.ts
[ADD]    apps/api/src/features/business-setup-agent/auth.ts
[ADD]    apps/api/src/features/business-setup-agent/service.ts
[ADD]    apps/api/src/features/business-setup-agent/mcp-routes.ts
[ADD]    apps/api/src/features/business-setup-agent/observability.ts (pendiente; usar logger seguro antes de staging)
[ADD]    apps/api/test/business-profile-inventory.test.mjs
[ADD]    apps/api/test/business-profile-inventory-db.test.mjs
[ADD]    apps/api/test/business-profile-contracts.test.mjs
[ADD]    apps/api/test/business-setup-agent-auth.test.mjs
[ADD]    apps/api/test/business-setup-agent.test.mjs
[ADD]    apps/api/test/business-setup-agent-db.test.mjs
[ADD]    apps/api/test/helpers/business-profile-fixtures.mjs
[MODIFY] apps/dashboard/src/api.ts
[ADD]    apps/dashboard/src/features/admin/BusinessProfilesSection.tsx
[MOVE]   apps/dashboard/src/features/admin/BusinessProfileEditor.tsx
         -> apps/dashboard/src/features/admin/BusinessProfileModal.tsx
[ADD]    apps/dashboard/src/features/admin/business-profile-state.ts
[ADD]    apps/dashboard/src/features/admin/business-profile-ui.ts
[ADD]    apps/dashboard/src/features/auth/OAuthConsentPage.tsx (pendiente de registrar el authorization server)
[MODIFY] apps/dashboard/src/App.tsx
[MODIFY] apps/dashboard/test/business-profiles.test.mjs
[ADD]    apps/dashboard/test/business-profile-modal.test.mjs
[ADD]    apps/dashboard/test/oauth-consent.test.mjs
[ADD]    supabase/migrations/20260922190000_business_profile_inventory.sql
[ADD]    supabase/migrations/20260922190001_business_setup_agent.sql
[MODIFY] docs/current-status.md
[MODIFY] docs/architecture/backend.md
[MODIFY] docs/architecture/dashboard-frontend.md
[MODIFY] docs/integrations/supabase.md
[MODIFY] apps/api/README.md
[MODIFY] apps/dashboard/README.md
```

## Pruebas y trazabilidad

| Requisito | Riesgo | Nivel/evidencia | Resultado esperado |
| --- | --- | --- | --- |
| FR-001–005 | límite 200, cursores, filtros, empates | API + Supabase local | Página estable, total exacto, cualquier perfil encontrable. |
| FR-006–008, FR-022 | modal stale, descarte, foco, 320 px | UI comportamiento + navegador | Sin overwrite; contexto y accesibilidad conservados. |
| FR-009–010 | retiro con QRs | API + DB | Todo-o-nada, sin DELETE ni pérdida histórica. |
| FR-011–015 | auth y prepare no mutante | MCP/API | Actor/cliente válidos; propuesta opaca y expirable. |
| FR-016–020, FR-023 | commit atómico/idempotente y reuse sin overwrite | DB + MCP | Perfil, QR y auditoría consistentes o ningún cambio. |
| FR-021 | móvil sin Mac remoto | E2E staging | OAuth y operación completan desde ChatGPT móvil. |
| NFR-001 | 10 000 perfiles | `EXPLAIN` + medición staging | p95 <800 ms e índice justificado. |
| NFR-002–004 | token/reintento/revocación | integración seguridad | Rechazo seguro y recuperación idempotente. |

Primero se añaden regresiones para el límite 200 y editor por UUID. Los fakes HTTP solo cubren
transporte: RLS, grants, funciones, locks y atomicidad requieren Supabase local. El gate móvil/OAuth
es evidencia manual en staging y permanece pendiente hasta ejecutarse. Cierre: `pnpm test`,
`pnpm typecheck` y `pnpm build`.

## Fases de entrega

1. **Inventario**: tipos, función/índices, endpoint paginado y pruebas.
2. **Experiencia admin**: lista responsive, modal, 409 y retiro seguro.
3. **Servicio de agente**: preparación, operaciones, RPC atómica e idempotencia.
4. **MCP/OAuth**: transporte, JWT/JWKS, consentimiento y cliente de staging.
5. **Certificación**: suites, Supabase local, staging autorizado y recorrido móvil; producción es otro
   gate.

Observabilidad: operation/request ID, actor interno, `client_id`, herramienta, duración y resultado,
sin tokens ni payload completo. Contención: propuesta expirable, revisiones, locks estables y una
transacción. Rollback: retirar `/mcp` o UI manteniendo las tablas aditivas; no hay rollback destructivo.

## Complejidad justificada

| Complejidad | Necesidad | Alternativa descartada | Condición |
| --- | --- | --- | --- |
| MCP + OAuth | ChatGPT móvil necesita frontera estándar/autenticada. | Mac remoto es frágil y no auditable. | Mantener mientras exista integración agente. |
| Tabla de operaciones | Preflight e idempotencia sobreviven reinicios/red. | Memoria del Worker no persiste. | Mantener mientras el agente escriba. |
| SDK MCP + `jose` | Protocolo y criptografía correctos. | Implementación manual aumenta riesgo. | Revisar versiones con upgrades del Worker. |
