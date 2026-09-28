# Investigación y decisiones: agente remoto de campo

## Codex Remote como superficie móvil

**Decisión**: usar una tarea Codex dedicada que corre en el Mac y se controla desde la pestaña Remote de la
app móvil de ChatGPT.

**Razón**: la documentación oficial describe el teléfono como plano de control; archivos, credenciales,
permisos, plugins y ejecución permanecen en el host conectado. Remote puede iniciar/dirigir tareas y mostrar
aprobaciones, adjuntos, skills y plugins sin abrir un puerto entrante en el Mac.

Fuentes:

- [ChatGPT Work y Codex — FAQ](https://help.openai.com/en/articles/20001275/)
- [Mastering remote engineering work from your phone](https://developers.openai.com/blog/mastering-codex-remote-for-engineering)
- [Work with Codex from anywhere](https://openai.com/index/work-with-codex-from-anywhere/)

**Límite explícito**: Codex no se selecciona como una conversación móvil normal; se accede a tareas desktop
compatibles desde Remote. La documentación no garantiza Voice dentro de Remote. La certificación usa texto o
dictado del teclado de iOS, que produce un prompt de texto revisable antes de enviarlo.

**Alternativas descartadas**:

- ChatGPT móvil genérico con credenciales pegadas: no es auditable ni seguro.
- Escritorio remoto/VNC: expone más superficie, peor experiencia y no aprovecha confirmaciones estructuradas.
- Task de desarrollo dentro del repo: concede contexto y capacidad innecesarios para visitas comerciales.

## Plugin privado y skill

**Decisión**: empaquetar MCP y workflow en un plugin privado, con artefactos distintos para staging y
producción. La primera instalación/certificación será staging.

**Razón**: un plugin da identidad estable y agrupa el servidor con instrucciones de uso. El MCP aplica
autenticación y reglas; el skill indica secuencia, fuentes, preguntas y formato de confirmación.

Fuentes:

- [Plugin architecture](https://developers.openai.com/plugins/concepts/plugins)
- [Package your plugin](https://developers.openai.com/plugins/build/plugins)
- [Build skills](https://developers.openai.com/plugins/build/skills)

La implementación usará `$plugin-creator` para evitar un manifiesto inventado. El plugin no incluirá scripts,
hooks, UI ni secretos en v1. Tendrá un skill `create-or-update-prospect-profile` y una conexión HTTPS al MCP.

## OAuth 2.1 con Supabase

**Decisión**: mantener Supabase Auth como authorization server OAuth 2.1/OIDC, con Authorization Code + PKCE,
consentimiento propio y discovery oficial de Supabase.

**Razón**: Supabase ya soporta usuarios, PKCE, refresh rotation, consentimiento y discovery para MCP. El MCP
ParaHoy es el recurso; no debe fingir ser también el authorization server.

Fuentes:

- [MCP Authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [Getting Started with OAuth 2.1 Server](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [OAuth 2.1 Flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows)
- [Supabase Changelog](https://supabase.com/changelog)

Discovery normativo:

```text
MCP ParaHoy
  /.well-known/oauth-protected-resource
    authorization_servers: [https://<project-ref>.supabase.co/auth/v1]

Supabase
  /.well-known/oauth-authorization-server/auth/v1
  /auth/v1/oauth/authorize
  /auth/v1/oauth/token
```

La ruta artesanal actual `/.well-known/oauth-authorization-server` del Worker se retira. Sintetizar
`<issuer>/authorize` y `<issuer>/token` contradice los endpoints oficiales `/oauth/authorize` y `/oauth/token`.

### Registro de cliente

Codex/los clientes MCP pueden necesitar Dynamic Client Registration. Para reducir exposición:

1. habilitar OAuth server y consentimiento en staging;
2. habilitar DCR temporalmente;
3. conectar el plugin controlado y capturar su `client_id`/redirect URI;
4. verificar nombre y redirect URI;
5. añadir el ID a `MCP_ALLOWED_CLIENT_IDS` de staging;
6. deshabilitar DCR;
7. revocar cualquier cliente de prueba no reconocido.

Producción repite el proceso con otro proyecto, cliente, plugin y autorización explícita. Nunca se copia el
grant de staging. Los scopes iniciales son `openid email profile`; el rol `system_admin` se comprueba en la
base de ParaHoy y no se infiere de scopes.

## Prepare, confirmación y commit

**Decisión**: conservar herramientas separadas y ampliar el patrón a actualizaciones. Preparar es de solo
lectura pública/normalización y escribe únicamente su registro efímero; commit requiere una confirmación
inmediatamente anterior.

**Razón**: evita que una investigación ambigua tenga impacto. El hash enlaza exactamente lo visto con lo
ejecutado; las revisiones evitan sobrescritura; `operationId` permite recuperación tras pérdida de red.

El agente no interpretará un “sí” histórico. Tras mostrar el bloque final pregunta una frase concreta que
incluye ambiente, perfil y QR. Cualquier modificación posterior invalida esa confirmación y exige preparar de
nuevo.

## Unificación de operaciones v2

**Decisión**: crear `control.business_agent_operations` para los nuevos contratos y conservar
`control.business_setup_operations`/RPC legacy sin drops.

**Razón**: la tabla legacy exige QR y solo modela setup. Hacer columnas críticas nullable y reutilizar su RPC
complicaría constraints y rollback. La tabla v2 expresa `setup` y `profile_update`, soporta lease de assets y
permite que clientes anteriores sigan funcionando durante el rollout.

## Importación segura de imagen remota

**Decisión**: prepare valida sintaxis y conserva hash/origen sanitizado; commit recibe nuevamente la URL,
verifica hash, reclama una lease, descarga y crea un asset staged usando el servicio de feature 013. La descarga
solo ocurre después de confirmar derechos.

**Razón**: no persistir la URL completa evita query strings sensibles. Reenviarla impide que el servidor tenga
que guardar un secreto/capability URL. La lease evita importaciones activas duplicadas en reintentos.

Controles:

- HTTPS y puertos 443/omitido; sin `userinfo`;
- resolver A/AAAA mediante DNS-over-HTTPS permitido por Cloudflare inmediatamente antes de cada request y
  rechazar rangos privados, loopback, link-local, multicast, reservados y hosts internos;
- rechazar IPs literales en URL de entrada y redirects;
- no reutilizar resolución al seguir redirects; máximo tres, todos validados como HTTPS;
- verificar hostname y URL efectiva final después del fetch;
- timeout total 15 s y stream máximo 3 MiB;
- Content-Type permitido más firma/decodificación real;
- JPEG, PNG, WebP; nunca SVG;
- no reenviar `Authorization`, cookies ni headers de usuario;
- `source_origin` conserva esquema+host+path normalizado, sin query/fragment; el hash cubre la URL completa.

Cloudflare Workers no permite fijar el socket de salida a la IP validada por DNS-over-HTTPS. Por tanto queda un
riesgo residual pequeño de DNS rebinding entre la validación y la resolución interna que usa el fetch de
Cloudflare. El Worker solo realiza egreso HTTP(S) público aislado, no posee rutas a redes privadas ni reenvía
credenciales. Se permite cualquier URL HTTPS pública bajo los límites descritos; no se afirma protección SSRF
absoluta.

La implementación debe comprobar las capacidades vigentes de resolución/egreso de Cloudflare antes de elegir
APIs específicas. Si no puede demostrar que el resolver DoH es confiable, que IPs no públicas se bloquean
antes del fetch y que los redirects se controlan manualmente, se detiene la importación remota y se conserva el
flujo sin imagen hasta actualizar la decisión con el usuario. La importación puede dejar un asset staged si la
transacción final encuentra revisión stale. No queda público y expira mediante feature 013.

## Fuentes y evidencia

**Decisión**: el skill usa navegación disponible para investigar, pero envía al MCP solo evidencia estructurada
y URLs HTTPS sanitizables. Fuentes preferidas: sitio propio, perfiles sociales oficiales y ficha de Google
confirmada. Directorios/agregadores son secundarios y nunca resuelven un conflicto por sí solos.

El backend no verifica semánticamente que una red social pertenezca al negocio. Valida formato y registra la
evidencia; la decisión sigue siendo humana. La propuesta distingue `confirmed`, `inferred` y `unverified`.

## Separación de ambiente

**Decisión**: dos paquetes visibles:

- `ParaHoy Prospectos — STAGING`, apuntando al Worker staging;
- `ParaHoy Prospectos — PRODUCCIÓN`, creado/instalado únicamente durante el rollout productivo autorizado.

Cada tool devuelve `environment`; el skill compara el valor esperado. La tarea se nombra con el ambiente y la
confirmación lo repite. Un `client_id` de staging nunca está en la allowlist de producción.

## Límites y abuso

**Decisión**: defaults de 120 prepares/hora y 30 commits/hora por `(actor_user_id, oauth_client_id)` con
respuesta controlada y `Retry-After`. Los valores serán bindings tipados por ambiente, con esos defaults.

Un prepare cuenta cada fila creada. Un commit cuenta solo el primer intento autenticado de cada
`operationId`, mediante `commit_attempted_at` fijado una vez; reintentos idempotentes no gastan cupo adicional.

**Razón**: una visita puede requerir varias iteraciones, pero los commits son infrecuentes. El límite reduce
loops del agente sin bloquear una jornada normal. No se implementan cuotas comerciales ni billing.
