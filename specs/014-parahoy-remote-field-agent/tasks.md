# Tareas: agente remoto de campo ParaHoy

**Entrada obligatoria**: leer todos los artefactos de este directorio, feature 009, feature 013,
`AGENTS.md`, constitución, arquitectura, CODESTYLE y TESTING.
**Orden**: una fase a la vez; pruebas verdes y Conventional Commit antes de continuar.
**Prohibición**: no configurar/desplegar/migrar staging o producción sin autorización posterior específica.

**Estado local 2026-09-28**: Feature 014 no está completa. Se endureció la validación OAuth/JWKS y hay una
prueba de JWT RS256, `get_dynamic_link_unit`, límites/semántica básica de transporte MCP, UI local de
consentimiento y paquetes plugin separados con test de separación/ausencia de credenciales. No se
implementaron `business_agent_operations` v2, update prepare/commit, importación remota SSRF-segura, DCR/OAuth
en proyectos remotos ni los gates de instalación. Las capacidades MCP se reportan como no disponibles donde
falta implementación. Las pruebas puntuales de API/plugins y typecheck pasan, pero el feature no está listo
para staging. No marcar fases como completas sin la evidencia y revisión prescritas.

## Fase 0 — Baseline y dependencias

- [ ] T001 Confirmar con `git status`, historial y tests que features 012 y 013 están implementadas/cerradas; si
  no lo están, detener 014 y completar sus tasks primero.
- [ ] T002 Releer la implementación/evidencia pendiente de `009-profile-management-agent-actions` y registrar en
  su spec/tasks que 014 reemplaza únicamente la estrategia móvil/OAuth pendiente, sin reescribir evidencia
  histórica.
- [ ] T003 Ejecutar pruebas focalizadas actuales de MCP/perfiles y guardar el baseline; no atribuir fallos previos
  a 014.
- [ ] T004 Invocar y seguir los skills `supabase` y `supabase-postgres-best-practices` antes de diseñar SQL; leer
  cualquier referencia obligatoria que indiquen.

## Fase 1 — Contratos compartidos y errores

- [ ] T005 Extender `packages/types/src/business-setup-agent.ts` (o el dueño existente) con los tipos v2 exactos
  de `contracts/parahoy-agent-tools-v2.md`, incluidos evidence, appearance, avatar y resultados.
- [ ] T006 Añadir límites constantes para 20 evidencias, 30 links, URL 2048, nota 240, alt 160, prepare 10 min,
  lease 120 s y descarga 15 s; evitar números duplicados entre API/tests.
- [ ] T007 Añadir todos los códigos nuevos al catálogo de mensajes seguros en español, con `field` y
  `retryAfterSeconds` cuando correspondan.
- [ ] T008 Implementar canonicalización/hash determinista de comandos y patches en `packages/core` o el feature
  dueño; probar orden de objetos/arrays, null/omisión y booleans de consentimiento.
- [ ] T009 Añadir tests de tipos/core y ejecutar test/typecheck focalizados.
- [ ] T010 Crear Conventional Commit enfocado para contratos v2.

## Fase 2 — Operaciones v2 en Supabase

- [ ] T011 Crear la migración `business_agent_operations_v2` con Supabase CLI, sin editar migraciones aplicadas.
- [ ] T012 Crear `control.business_agent_operations` con enums/checks, FKs `ON DELETE RESTRICT`, timestamps y
  constraints por `kind`/imagen exactamente como `data-model.md`.
- [ ] T013 Forzar RLS, revocar grants de `public/anon/authenticated`, conceder solo service role y añadir
  comentarios SQL de seguridad/retención.
- [ ] T014 Crear índices únicos/parciales y de targets; validar su necesidad/forma con `EXPLAIN` sobre fixtures.
- [ ] T015 Implementar función transaccional de rate limit por actor+cliente para prepares y commits únicos,
  contando `commit_attempted_at` una sola vez por operationId con locks estables y ventanas de una hora.
- [ ] T016 Implementar `control.claim_business_agent_asset_import` con validación de token/actor/client/env/hash,
  idempotencia, lease y resultados download/reuse/committed/in-progress.
- [ ] T017 Implementar `control.attach_business_agent_staged_asset` con lease, ownership, status y expiración.
- [ ] T018 Implementar `control.commit_business_agent_operation` para `setup`: duplicado explícito, creación
  completa, publicación, QR activo/consentimiento, auditoría y resultado idempotente.
- [ ] T019 Ampliar T018 para `profile_update`: estado final completo, revisión, consentimiento published,
  apariencia/avatar y conteo QR sin modificar URLs permanentes.
- [ ] T020 Revocar/grantear ejecución por firmas exactas, usar `security invoker`, `search_path=''` y nombres
  calificados; conservar tabla/RPC legacy sin cambios destructivos.
- [ ] T021 Crear `supabase/tests/business-agent-operations-v2.sql` con RLS/grants, constraints, expiración,
  rate limit, lease/reclaim, setup/update, stale, rollback, replay y operation reuse.
- [ ] T022 Ejecutar migración desde DB local limpia y desde snapshot con datos legacy; ejecutar lint, tests SQL y
  `EXPLAIN`; corregir todos los hallazgos.
- [ ] T023 Crear Conventional Commit enfocado de migración/RPC con evidencia local.

## Fase 3 — OAuth Protected Resource y verificación JWT

- [ ] T024 Actualizar bindings/config tipado con issuer, audience, resource URL, client IDs y límites; exigir
  allowlist no vacía fuera de local/test cuando MCP esté habilitado.
- [ ] T025 Corregir `/.well-known/oauth-protected-resource` con resource/scopes/cache y retirar la metadata
  artesanal `/.well-known/oauth-authorization-server` de `apps/api/src/index.ts`.
- [ ] T026 Refactorizar `auth.ts` para validar `RS256|ES256`, `kid`, issuer, audience, exp, nbf, subject UUID y
  `client_id` obligatorio; retirar fallback `azp` en v2.
- [ ] T027 Implementar cache JWKS cinco minutos y un refresh ante `kid` desconocido; fallo cerrado y mensaje
  seguro si JWKS no está disponible.
- [ ] T028 Distinguir 401 con challenge para token ausente/inválido de 403 para rol/cliente prohibido, sin revelar
  allowlists o existencia de usuarios.
- [ ] T029 Añadir tests con pares de claves efímeros reales para metadata, challenge, firma/alg/kid, issuer,
  audience, exp/nbf, sub, client ID, rol, rotación y JWKS caído; el bypass `APP_ENV=test` no puede ser la única
  evidencia.
- [ ] T030 Ejecutar tests/typecheck API focalizados y crear Conventional Commit OAuth backend.

## Fase 4 — Consentimiento OAuth en dashboard

- [ ] T031 Habilitar OAuth server en `supabase/config.toml` local, conservar `/oauth/consent` y DCR false por
  defecto; documentar que remotos se configuran por gate, no migración.
- [ ] T032 Crear `OAuthConsentPage.tsx` con parsing seguro de `authorization_id`, estados loading/error y detalle
  obtenido mediante `supabase.auth.oauth.getAuthorizationDetails`.
- [ ] T033 Mostrar nombre del cliente, ambiente derivado del build/config, scopes y capacidades ParaHoy; no
  confiar en nombre/redirect recibido por query.
- [ ] T034 Implementar approve/deny con métodos `supabase.auth.oauth`, botón único en vuelo y mensajes
  controlados.
- [ ] T035 Integrar `/oauth/consent` antes de resolución de tenant; si falta sesión, reutilizar login y preservar
  únicamente retorno interno+authorization ID sin open redirect.
- [ ] T036 Añadir tests de ruta sin ID, sesión ausente/retorno, detail, approve, deny, cancelación, error, scopes,
  ambiente, foco/teclado/aria y 320 px en `apps/dashboard/test/oauth-consent.test.mjs`.
- [ ] T037 Ejecutar tests/typecheck/build dashboard focalizados y login de regresión; crear Conventional Commit.

## Fase 5 — MCP v2, prepare y commit sin imagen

- [ ] T038 Extraer errores, schemas y definiciones de tools de `mcp-routes.ts` para mantener el router delgado y
  mensajes centralizados.
- [ ] T039 Completar Streamable HTTP stateless: protocolo, content negotiation, 202 notification, 405 GET/DELETE,
  límite 256 KiB y errores JSON-RPC; no añadir dependencia MCP sin actualizar primero el plan.
- [ ] T040 Extender `parahoy_get_connected_account` con serverVersion/capabilities y añadir
  `parahoy_get_dynamic_link_unit`.
- [ ] T041 Implementar sanitización de evidence: HTTPS, sin userinfo/query/fragment, máximo 20, supports/confidence
  allowlisted y note limitada.
- [ ] T042 Implementar prepare setup v2 con appearance, avatar hash sin fetch, evidence, Google resolver,
  coincidencias, QR/revisión, diff, warnings y registro en tabla v2.
- [ ] T043 Implementar aplicación pura del patch update: omisión preserva, null limpia opcionales, links presente
  reemplaza, appearance parcial produce estado completo y avatar action es explícita.
- [ ] T044 Implementar prepare update con perfil fresco, conteo QR, revisión, validación final, diff/evidence y
  registro v2; rechazar disabled/reactivación y no-op.
- [ ] T045 Implementar commit setup/update sin imagen contra RPC v2, command hash, todos los consentimientos y
  replay; mantener nombres de tools existentes para setup.
- [ ] T046 Aplicar rate limits DB a prepare/commit y headers `Retry-After`/structured error sin depender de memoria
  del Worker.
- [ ] T047 Añadir tests MCP/API de schemas estrictos, lecturas, prepares sin mutación, normalización, expiración,
  consentimientos, duplicate reuse, update patch, stale, replay, rate limit y errores controlados.
- [ ] T048 Ejecutar tests/API typecheck y pruebas Supabase locales combinadas; crear Conventional Commit MCP v2
  sin imagen.

## Fase 6 — Importación remota protegida

- [ ] T049 Crear `remote-image-import.ts` con interfaces inyectables de DNS/fetch/reloj y parser de URL HTTPS,
  userinfo/puerto/hostname.
- [ ] T050 Implementar clasificación completa de IPv4, IPv6 e IPv4-mapped IPv6 para rangos no públicos, rechazo
  de IP literals y tests parametrizados de límites.
- [ ] T051 Implementar resolver A/AAAA mediante DoH permitido por Cloudflare inmediatamente antes de cada salto,
  redirects manuales máximo tres, validación de destino final, sin credenciales/cookies/referrer y timeout total
  15 s; documentar el riesgo residual de rebinding porque el runtime no permite pinning del socket.
- [ ] T052 Implementar lectura streaming con corte >3 MiB y reutilizar validación real JPEG/PNG/WebP de feature
  013; no aceptar SVG ni MIME/firma inconsistente.
- [ ] T053 Integrar claim/lease, fetch, creación staged, attach y commit/replay en ambas tools de commit; verificar
  hash exacto y `imageRightsConfirmed` antes de red.
- [ ] T054 Aplicar compensación si Storage sube pero falla la creación de fila; conservar staged privado si falla
  después de attach/por stale.
- [ ] T055 Añadir logs/auditoría permitidos sin URL completa, query, IP, bytes, headers remotos, token o lease ID.
- [ ] T056 Añadir tests de todas las variantes SSRF, DoH, redirect/rebinding simulado, status/timeout/tamaño/MIME/firma,
  rights/source mismatch, concurrencia, lease vencida y stale post-import.
- [ ] T057 Ejecutar tests/typecheck API y SQL locales; crear Conventional Commit de importación remota.

## Fase 7 — Plugins privados y workflow

- [ ] T058 Invocar `$plugin-creator` y crear el paquete staging bajo `plugins/parahoy-prospectos-staging/` con
  identidad clara, `.mcp.json` y skill; no escribir manifiestos desde memoria si el skill genera otro formato.
- [ ] T059 Crear el paquete production con ID/nombre/URL MCP distintos y mismo workflow de seguridad; no instalar,
  conectar ni autorizarlo.
- [ ] T060 Escribir `SKILL.md` siguiendo literalmente `contracts/remote-field-workflow.md`: trigger, account/env
  check, investigación, prepare, resumen, confirmación, commit, errores y prohibiciones.
- [ ] T061 Añadir references `confirmation-template.md` y `source-policy.md` a ambos paquetes; evitar duplicación
  divergente mediante fuente compartida de test o comparación normalizada.
- [ ] T062 Verificar que manifests/plugins no contienen secretos y que `.gitignore` excluye cualquier cache/token
  local sin ocultar archivos requeridos.
- [ ] T063 Añadir tests del paquete: schema/paths, IDs/URLs distintas, reglas críticas presentes, activación
  directa/indirecta/incompleta/fuera de alcance y ausencia de Supabase MCP/SQL/deploy/NFC.
- [ ] T064 Validar los paquetes con comandos/herramientas indicados por `$plugin-creator`; registrar que la
  instalación real staging sigue siendo gate externo.
- [ ] T065 Crear Conventional Commit enfocado de plugins y workflow.

## Fase 8 — Documentación durable y verificación local integral

- [ ] T066 Crear `docs/runbooks/remote-prospect-agent.md` con tarea projectless, Mac/Remote, instalación staging,
  OAuth bootstrap/DCR, visita, revocación, fallback y procedimiento productivo separado.
- [ ] T067 Actualizar `docs/architecture/backend.md`, `docs/architecture/dashboard-frontend.md`,
  `docs/integrations/supabase.md`, `docs/flows/presence-digital.md` y `docs/runbooks/smoke-tests.md`.
- [ ] T068 Actualizar `apps/api/README.md`, `apps/dashboard/README.md`, `packages/types/README.md`, raíz README/
  ARCHITECTURE/PROJECT_CONTEXT cuando corresponda, y corregir toda afirmación de OAuth/MCP/NFC obsoleta.
- [ ] T069 Actualizar `docs/current-status.md` con implementación local real, distinguir lo no certificado y
  registrar que producción no fue modificada.
- [ ] T070 Ejecutar todo `quickstart.md` local, revisar logs por datos sensibles y registrar evidencia exacta.
- [ ] T071 Ejecutar `pnpm test`, `pnpm typecheck`, `pnpm build` y `supabase db lint --local`; reportar bloqueos y
  no sustituir comportamiento con inspección de source.
- [ ] T072 Solicitar revisión independiente de `checklists/security-operations.md`; el implementador no marca sus
  ítems.
- [ ] T073 Ejecutar `$speckit-analyze`; resolver inconsistencias en el artefacto dueño únicamente según el flujo
  de aprobación del skill.
- [ ] T074 Ejecutar `$speckit-converge`, implementar tareas añadidas y repetir hasta que no queden pendientes
  locales.
- [ ] T075 Reconciliar tasks/evidencia/Git y crear el commit final de documentación/cierre local.

## Gate staging — no ejecutar sin autorización posterior

- [ ] T076 Con autorización explícita, backup/dry-run y aplicar migración/desplegar API+dashboard staging del
  commit exacto.
- [ ] T077 Configurar Site URL/consent/OAuth staging, habilitar DCR temporal, conectar plugin staging, verificar
  cliente/redirect, allowlistear y apagar DCR.
- [ ] T078 Crear tarea projectless `Prospectos ParaHoy — STAGING`, verificar Mac/Remote e instalar solo el plugin
  staging.
- [ ] T079 Ejecutar la matriz de 20 recorridos iPhone de `quickstart.md`, métricas, revocación/reconexión y
  checklist independiente.
- [ ] T080 Corregir hallazgos mediante una nueva fase versionada y repetir gates; no promover automáticamente.

## Gate producción — autorización nueva y separada

- [ ] T081 Solicitar autorización que nombre commit, migración, Worker, dashboard, Supabase y OAuth production.
- [ ] T082 Con esa autorización, ejecutar backup/dry-run, despliegue compatible y cliente production nuevo con
  DCR temporal/off, allowlist distinta y plugin production.
- [ ] T083 Ejecutar un canario QR/perfil designado, revisar auditoría/health y documentar rollback/observación.
