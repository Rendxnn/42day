# Plan de implementación: agente remoto de campo ParaHoy

**Feature**: `014-parahoy-remote-field-agent`
**Especificación**: `specs/014-parahoy-remote-field-agent/spec.md`
**Dependencias**: features 012 y 013 implementadas y verificadas; feature 009 permanece como base legacy
**Estado**: listo para tareas e implementación por fases

## Objetivo técnico

Convertir el MCP experimental de feature 009 en una frontera autenticada y operable desde un plugin privado de
Codex Remote. Se amplían sus herramientas para crear o actualizar perfiles con apariencia/avatar, se completa
OAuth/consentimiento usando discovery oficial de Supabase y se empaqueta un skill determinista para visitas de
campo. Toda escritura conserva prepare/confirm/commit, revisión optimista, idempotencia y separación de ambiente.

## Precondiciones obligatorias

Antes de iniciar este feature, el implementador debe verificar:

1. `012-manual-nfc-copy-only` cerró y no hay CTA activo a NFC.cool.
2. `013-brandable-business-profiles` cerró localmente y existen tipos, RPC y servicio de assets.
3. La rama no contiene cambios ajenos que se solapen; `.codex-artifacts/` sigue fuera del alcance.
4. Se leen completos `AGENTS.md`, constitución, arquitectura, CODESTYLE, TESTING, feature 009 y estos artefactos.
5. Se invocan los skills `supabase` y `supabase-postgres-best-practices` para la fase de datos y
   `plugin-creator` al crear los paquetes; no se inventan sus formatos.

## Decisiones cerradas

1. La superficie móvil es Codex Remote sobre el Mac del administrador; el Mac inicia conexiones salientes.
2. La tarea operativa es projectless y no necesita el repo, Supabase MCP ni credenciales de proveedores.
3. Staging se implementa/certifica primero. Producción tiene paquete/configuración separados y no se conecta ni
   despliega sin autorización posterior.
4. El transporte continúa en el Worker HTTPS y usa MCP Streamable HTTP stateless 2025-06-18.
5. Se conserva el handler ligero actual; no se agrega `@modelcontextprotocol/sdk` ni otra dependencia en esta
   feature. La interoperabilidad real con Codex es gate de staging. Si ese gate demuestra incompatibilidad, se
   detiene y se actualiza este plan antes de añadir una dependencia.
6. Supabase Auth es el único authorization server; el Worker solo es OAuth Protected Resource.
7. `client_id` es obligatorio. En v2 no se acepta `azp` como sustituto.
8. Los nuevos contratos usan `control.business_agent_operations`; la tabla/RPC de feature 009 queda legacy.
9. La importación de imagen ocurre después de confirmar y reutiliza el servicio staged/active de feature 013.
10. Ninguna tool ofrece SQL, gestión de despliegue, hard delete, deshabilitación, lote o hitos NFC.
11. El flujo certificado usa texto/dictado de iOS; no se implementa audio.

## Arquitectura futura

```text
iPhone: ChatGPT > Remote > tarea "Prospectos ParaHoy — STAGING"
        │ relay seguro de Codex
        ▼
Mac: Codex task projectless + plugin privado
        ├── skill de investigación/confirmación
        └── MCP HTTPS OAuth
                    │
                    ▼
Cloudflare Worker staging/production
  ├── Protected Resource Metadata
  ├── verificación JWT/JWKS + rol + client allowlist
  ├── tools read / prepare / commit
  ├── fetch remoto de imagen protegido contra SSRF
  └── repositorios/RPC ParaHoy
                    │
                    ▼
Supabase del mismo ambiente
  ├── OAuth 2.1 + consentimiento dashboard
  ├── control.business_agent_operations
  ├── business_profiles/assets
  └── dynamic_link_units + auditoría
```

## Responsabilidades

### Plugin y skill

- Activar solo ante creación/actualización de prospecto ParaHoy.
- Verificar cuenta y ambiente primero.
- Investigar mediante herramientas abiertas disponibles, nunca mediante credenciales ParaHoy.
- Construir evidencia y propuesta; usar MCP como autoridad de normalización.
- Mostrar el resumen normativo y pedir confirmación inmediatamente antes del commit.
- Reusar `operationId` en reintentos; nunca generar uno nuevo para el mismo comando incierto.
- Ofrecer fallback al dashboard, no a SQL ni a APIs privilegiadas.

### OAuth/dashboard

- Servir `/oauth/consent` antes de la shell administrativa normal.
- Preservar `authorization_id` durante login mediante retorno interno allowlisted.
- Llamar exclusivamente los métodos OAuth de `supabase-js` documentados.
- Mostrar cliente, ambiente, scopes y capacidades reales; aprobar/denegar de forma accesible.
- No almacenar client secret, authorization code, access/refresh token ni authorization ID en Storage/local
  persistente/logs.

### MCP/API

- Resolver autenticación antes de parsear inputs sensibles o consultar entidades.
- Publicar resource metadata correcta y retirar AS metadata artesanal.
- Mantener JSON Schema estricto y códigos/mensajes controlados.
- Separar servicios de prepare, commit, rate limit e importación remota.
- Delegar mutación transaccional a RPC v2 y compensar objetos Storage cuando corresponda.

### Base de datos

- Persistir snapshot/propuesta efímera e idempotencia, no tokens crudos ni URL completa.
- Bloquear filas en orden estable y validar revisiones dentro de la transacción.
- Auditar resultado mínimo y mantener RLS/grants service-only.
- Conservar estructuras legacy sin migración destructiva.

## OAuth: diseño concreto

### Metadata

`apps/api/src/index.ts` conserva `/.well-known/oauth-protected-resource` y elimina la respuesta artificial de
`/.well-known/oauth-authorization-server`. El issuer configurado termina exactamente en `/auth/v1`. El resource
es la URL absoluta `/mcp` del Worker del ambiente.

### Consentimiento

Crear `apps/dashboard/src/features/auth/OAuthConsentPage.tsx`. En `App.tsx`, la resolución de rutas públicas
debe reconocer `/oauth/consent` antes de requerir la selección de tenant. El componente:

- obtiene `authorization_id` con `URLSearchParams`;
- usa la sesión Supabase existente o muestra el login normal preservando retorno;
- llama `supabase.auth.oauth.getAuthorizationDetails`;
- muestra datos y scopes recibidos, sin confiar en query params para nombre/redirect;
- llama approve/deny;
- muestra estados loading/error y mensajes controlados.

No se crea una API OAuth propia en el Worker. `supabase/config.toml` habilita OAuth server para local y mantiene
DCR deshabilitado por defecto. Staging DCR se habilita manual y temporalmente durante el gate.

### Verificación de token

Refactorizar `auth.ts` en utilidades testeables:

- parser bearer;
- verificador JOSE WebCrypto de `RS256`/`ES256`;
- cache JWKS cinco minutos con refresh único ante `kid` nuevo;
- validaciones exactas `iss`, `aud`, `exp`, `nbf`, `sub`, `client_id`;
- consulta de usuario/rol vigente;
- errores 401 vs 403 correctos.

Se mantiene WebCrypto; no se añade `jose`. Los tests usan claves efímeras reales y no un bypass por payload.

## Operaciones v2

### Prepare setup

1. Autorizar y rate-limit.
2. Validar input estricto.
3. Normalizar QR, identidad, links, apariencia y evidencia.
4. Para Google Reviews, usar el resolver existente.
5. Validar URL de avatar sintácticamente y calcular SHA-256 de la URL completa sin descargar.
6. Consultar QR/perfiles parecidos y construir el estado final/diff.
7. Insertar operación v2 con token hasheado y expiración diez minutos.
8. Devolver token crudo una vez.

### Prepare update

1. Obtener perfil fresco y conteo de QRs.
2. Aplicar patch puro al perfil actual. Omitido preserva; `null` limpia opcionales; `links` presente reemplaza.
3. Validar estado final con las mismas reglas que dashboard/RPC.
4. Crear diff, evidencia y operación v2 con revisión actual.

### Commit sin imagen

El servicio calcula `commandHash` canónico, llama directamente `commit_business_agent_operation` y devuelve el
resultado. La RPC maneja idempotencia y atomicidad.

### Commit con imagen

1. Validar confirmaciones y que SHA-256 de `imageSourceUrl` coincide.
2. Llamar `claim_business_agent_asset_import`.
3. Si `committed`, devolver replay; si `reuse`, saltar descarga; si in-progress, error con Retry-After.
4. Si `download`, resolver/fetch protegido y pasar bytes al mismo validador/servicio de feature 013.
5. Crear asset staged con `source_origin` sanitizado; adjuntarlo con lease.
6. Llamar commit final. Si queda stale, el asset permanece staged/no público y expira.

La lease dura 120 s y el fetch total 15 s. El commit no mantiene una transacción DB abierta durante red externa.

## Protección SSRF

Crear un módulo dedicado `remote-image-import.ts` con interfaz de resolver/fetch inyectable para pruebas.

- Solo `https:` y port vacío/443.
- Rechazar userinfo, hostname vacío y nombres localhost/internos.
- Resolver A/AAAA mediante DNS-over-HTTPS permitido por Cloudflare inmediatamente antes de cada salto; todas las
  IP resueltas deben ser públicas. Rechazar IP literals en entrada y redirects.
- Rechazar IPv4 privadas/reservadas, IPv4-mapped IPv6, loopback, link-local, ULA, multicast y documentación.
- Cloudflare Workers no permite fijar el socket de egreso a la IP validada: documentar el riesgo residual de
  rebinding entre validación y resolución interna del fetch. Validar además destino efectivo y DNS en cada
  redirect; el Worker solo hace egreso público aislado y no tiene rutas privadas ni reenvía credenciales.
- Máximo tres redirects manuales; cada `Location` se resuelve y revalida.
- Sin cookies, credentials, referrer ni headers entrantes; `Accept` limitado a imágenes permitidas.
- Cancelar al superar 3 MiB o 15 s; no cargar el body completo antes de aplicar límite.
- Validar status 2xx, MIME, magic bytes y decodificación con el servicio 013.

## Rate limiting

Usar la base de operaciones como fuente, contando por actor+cliente desde `created_at` para prepares y desde
`commit_attempted_at` para el primer intento de cada `operationId`. Una RPC fija ese timestamp una sola vez;
replays/reintentos del mismo ID no vuelven a consumir cupo. Para evitar carreras, un bloqueo consultivo por
bucket aplica:

- 120 prepares por hora;
- 30 commits por hora.

Bindings `MCP_PREPARE_LIMIT_PER_HOUR` y `MCP_COMMIT_LIMIT_PER_HOUR` permiten reducir por ambiente, con validación
tipada y defaults anteriores. No se usa memoria del Worker como única autoridad.

## Plugin y tarea operativa

Usar `$plugin-creator` para crear:

```text
plugins/parahoy-prospectos-staging/
plugins/parahoy-prospectos-production/
```

El paquete production se versiona pero no se instala/conecta. El skill sigue exactamente
`contracts/remote-field-workflow.md`. Añadir pruebas estáticas que fallen si:

- falta verificación de ambiente;
- se pide contraseña/token;
- falta prepare/confirm/commit;
- se permite SQL/Supabase MCP/despliegue/NFC;
- staging y production apuntan al mismo MCP o tienen el mismo identificador.

Después de instalar/actualizar un plugin, se abre una tarea nueva, pues las skills son snapshot/configuración de
sesión. La tarea recomendada se titula `Prospectos ParaHoy — STAGING`, es projectless y se fija en Remote.

## Estructura de archivos prevista

```text
packages/types/src/business-setup-agent.ts
packages/config/src/env.ts
apps/api/src/features/business-setup-agent/
  auth.ts
  errors.ts
  mcp-routes.ts
  rate-limit.ts
  remote-image-import.ts
  service.ts
apps/api/test/
  business-agent-oauth.test.mjs
  business-agent-v2.test.mjs
  business-agent-remote-image.test.mjs
apps/dashboard/src/features/auth/
  OAuthConsentPage.tsx
apps/dashboard/test/oauth-consent.test.mjs
plugins/parahoy-prospectos-staging/
plugins/parahoy-prospectos-production/
supabase/migrations/<timestamp>_business_agent_operations_v2.sql
supabase/tests/business-agent-operations-v2.sql
docs/runbooks/remote-prospect-agent.md
specs/014-parahoy-remote-field-agent/
```

Los archivos existentes se amplían en lugar de duplicar lógica. Si el layout real difiere, se conserva el dueño
funcional y se actualizan tareas/documentación antes de mover responsabilidades.

## Migración

Crear con:

```bash
supabase migration new business_agent_operations_v2
```

Orden:

1. Crear tabla, checks y FKs restrictivas.
2. Forzar RLS/revocar grants/otorgar service role.
3. Crear índices.
4. Crear funciones de rate limit, claim, attach y commit v2.
5. Revocar/grantear ejecución por firma exacta.
6. `notify pgrst, 'reload schema'`.

No copiar filas legacy porque vencen en diez minutos. No dropear tabla/RPC legacy ni cambiar operaciones ya
completadas.

## Estrategia de pruebas

### Unitarias/API

- OAuth metadata/challenge, JWT real válido y matriz issuer/aud/exp/nbf/sub/client/rol.
- Refresh JWKS ante nuevo `kid` y fallo cerrado.
- Schemas MCP estrictos, protocol initialize/list/call y 202 notification.
- Prepare setup/update sin mutaciones públicas, normalización, evidencia, expiración y diffs.
- Consentimientos QR/perfil/imagen, stale, duplicados e idempotencia.
- Rate limits con concurrencia.
- SSRF contra IPv4/IPv6/reservadas, redirects, DNS rebinding simulado, timeout/tamaño/MIME/firma.

### Supabase local real

- RLS/grants, constraints por kind y estados.
- Locks/lease/reclaim/reuse.
- Setup y update atómicos; rollback si asset/QR/perfil falla.
- Replay mismo comando y rechazo comando distinto.
- Auditoría sin datos sensibles.

### Dashboard

- consentimiento sin ID, no autenticado, detalle válido, approve, deny, error y retorno seguro.
- cliente/scopes/ambiente visibles, foco, teclado, lector de pantalla y 320 px.
- login normal no se rompe.

### Plugin/Remote

- activación directa e indirecta del skill;
- datos incompletos producen preguntas concretas;
- ambiente incorrecto detiene;
- resumen/confirmación cumplen contrato;
- attach/cámara se explica sin prometer importación directa;
- recorrido real desde iPhone Remote con dictado y reconexión.

## Rollout

### Local

Implementar todas las fases, migrar Supabase local, probar y documentar. No tocar proveedores remotos.

### Staging — requiere autorización posterior

1. Aplicar migración y desplegar API/dashboard staging.
2. Habilitar OAuth server, Site URL y consentimiento staging.
3. Bootstrap DCR y allowlist como indica el contrato; deshabilitar DCR.
4. Instalar plugin staging en el Mac y abrir tarea nueva projectless.
5. Ejecutar quickstart y 20 recorridos; revocar/reconectar.
6. Completar revisión independiente y observación.

### Producción — autorización separada

1. Confirmar commit exacto, migración, Worker/dashboard y proyecto Supabase productivo.
2. Backup y dry-run; desplegar código compatible antes/según migración forward.
3. Registrar cliente production nuevo, allowlist y DCR off.
4. Instalar/conectar solo plugin production y crear tarea separada.
5. Canario con un QR designado y revisión humana; monitoreo y rollback de cliente/plugin.

## Rollback

- Desconectar/revocar plugin detiene nuevas acciones sin afectar dashboard.
- Quitar `client_id` de allowlist bloquea inmediatamente el cliente.
- Volver al código anterior usa tools/table legacy; tabla v2 permanece sin drops.
- Assets staged no activados no son públicos y expiran.
- Un perfil/QR ya confirmado no se revierte automáticamente; se corrige mediante dashboard auditado.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Operar producción por error | Plugins/clientes/tareas separados + environment check y confirmación. |
| Modelo inventa datos | Política de fuentes, evidencia, coincidencias y preguntas obligatorias. |
| Confirmación se aplica a otro payload | Token, hash, revisión, expiración y diff normalizado. |
| DCR registra clientes no deseados | Ventana temporal, inspección, allowlist y DCR off. |
| OAuth metadata incorrecta | Discovery oficial Supabase, retirar metadata artesanal, E2E real. |
| SSRF por avatar | DoH por cada salto, rangos/IP literals bloqueados, redirect manual, sin headers, límites, lease;
  riesgo residual de rebinding documentado por límite de pinning del runtime. |
| Crash durante importación | Lease recuperable + asset staged privado + replay. |
| Remote/Mac no disponible | Dashboard móvil como fallback; no degradar seguridad. |
| Skill desactualizado | Plugin versionado, nueva tarea tras update, contract tests. |

## Mapeo requisito → evidencia

| Requisitos | Evidencia |
| --- | --- |
| FR-001–FR-006 | manifests/skills, tests estáticos y recorrido iPhone Remote. |
| FR-007–FR-014 | escenarios del skill + tests prepare/evidencia/sin mutación. |
| FR-015–FR-024 | schemas MCP, pruebas API y RPC local de setup/update. |
| FR-025–FR-031 | matriz SSRF/imagen/lease y assets staged/active. |
| FR-032–FR-038 | discovery OAuth, JWT tests, consentimiento y revocación staging. |
| FR-039–FR-045 | errores, rate limit idempotente, auditoría, runbook y gates de ambiente. |

## Condición de terminado

La implementación local termina cuando código, migración, plugins, tests y documentación convergen sin tareas
locales abiertas. La feature no se declara certificada para uso de campo hasta completar el gate Remote/OAuth en
staging y la revisión independiente. Producción permanece explícitamente fuera hasta otra autorización.
