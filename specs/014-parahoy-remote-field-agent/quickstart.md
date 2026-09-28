# Quickstart: validar agente remoto de prospectos

## Estado de este documento

Es un procedimiento de validación, no evidencia de ejecución. Nada marcado aquí autoriza staging o producción.
El implementador registra fecha, commit, ambiente y resultado real al ejecutarlo.

## Prerrequisitos locales

- Features 012 y 013 implementadas.
- Supabase CLI y stack local iniciados.
- Usuario local `system_admin`, QR disponible, QR activo y perfiles draft/published.
- Fixtures JPEG/PNG/WebP válidos, SVG, MIME falso, >3 MiB y servidores de prueba de redirects/IPs.
- iPhone y Mac solo son necesarios para el gate staging de Remote.

## Validación local

```bash
supabase migration up --local --yes
supabase db lint --local
pnpm --filter @42day/api test
pnpm --filter @42day/dashboard test
pnpm --filter @42day/api typecheck
pnpm --filter @42day/dashboard typecheck
pnpm --filter @42day/dashboard build
```

### OAuth

1. Activar OAuth local según `supabase/config.toml` y abrir `/oauth/consent` sin ID: error controlado.
2. Simular solicitud válida: la pantalla muestra cliente, scopes y ambiente.
3. Probar usuario sin sesión y comprobar retorno al mismo `authorization_id` después de login.
4. Aprobar y denegar; no debe construir manualmente redirect URI.
5. Verificar protected resource metadata y que la ruta artesanal de authorization server ya no existe.
6. Probar JWT firmado válido y rechazos por firma, `kid`, algoritmo, issuer, audience, exp, nbf, subject,
   `client_id` y rol.

### Tools y base real

1. Ejecutar initialize/list/call MCP con token de test firmado.
2. Preparar setup: no cambia perfil, QR, asset público ni auditoría de negocio.
3. Confirmar sin imagen: perfil publicado y QR cambian de forma atómica.
4. Repetir mismo `operationId`: replay sin duplicados; cambiar payload: rechazo.
5. Repetir con QR activo sin/con consentimiento.
6. Preparar update parcial: campos omitidos se preservan y links presentes reemplazan la lista completa.
7. Confirmar perfil publicado sin/con consentimiento y provocar revisión stale.
8. Verificar constraints, RLS, grants, locks y auditoría en Supabase local.

### Imagen y SSRF

1. Preparar con URL HTTPS; comprobar que no hubo descarga.
2. Confirmar sin derecho de uso o con otra URL: rechazo.
3. Importar JPEG/PNG/WebP válidos; asset termina activo y referenciado.
4. Rechazar HTTP, userinfo, puerto distinto, localhost, IP privada/reservada, IPv6 privada, redirect hacia red
   interna, más de tres redirects, timeout, >3 MiB, SVG, MIME falso y archivo corrupto.
5. Ejecutar dos commits simultáneos: uno obtiene lease y el otro recibe in-progress/replay; solo un asset queda
   activo.
6. Provocar stale después de importar: perfil/QR no cambian y asset queda staged/no público.

### Plugin

1. Validar manifests con la herramienta indicada por `$plugin-creator`.
2. Confirmar que ambos paquetes tienen IDs, nombres y URLs MCP diferentes.
3. Confirmar que no contienen passwords, tokens, service roles ni secretos OAuth.
4. Ejecutar casos de activación directa, indirecta, incompleta y fuera de alcance.
5. Revisar que siempre verifica ambiente, presenta resumen y pregunta antes de commit.

## Gate de staging — requiere autorización explícita

### Despliegue/configuración

1. Registrar commit exacto y ejecutar backup/dry-run de la migración staging.
2. Aplicar migración y desplegar API/dashboard staging.
3. Confirmar health, ambiente y URLs correctas.
4. Configurar Site URL `https://staging.parahoy.thaledon.com` y authorization path `/oauth/consent`.
5. Habilitar OAuth server; habilitar DCR temporalmente.
6. Instalar/conectar `ParaHoy Prospectos — STAGING` desde el Mac.
7. Verificar cliente/redirect URI, allowlistear su ID en Worker y deshabilitar DCR.
8. Abrir una tarea projectless nueva llamada `Prospectos ParaHoy — STAGING` y fijarla.

### iPhone Remote

1. Dejar Mac despierto, online y Codex disponible.
2. Abrir ChatGPT móvil → Remote → tarea staging.
3. Usar dictado del teclado para: `Crea un perfil para <negocio> y asígnalo al QR <código>`.
4. Verificar que el agente anuncia STAGING/cuenta antes de continuar.
5. Adjuntar una foto y confirmar que la usa como contexto pero no promete subirla directamente.
6. Revisar fuentes, coincidencias, links, paleta, imagen, QR y advertencias.
7. Corregir un dato: debe volver a preparar, no reutilizar la confirmación anterior.
8. Confirmar y abrir URL de perfil/QR devueltas.
9. Cortar red tras commit y reintentar: replay idempotente.
10. Revocar grant y confirmar que la siguiente tool falla; reconectar con consentimiento nuevo.

### Matriz mínima

Completar 20 recorridos:

- 5 creaciones sin imagen;
- 5 creaciones con imagen remota;
- 5 actualizaciones de perfil publicado;
- 2 QRs activos con consentimiento;
- 1 duplicate reuse;
- 1 stale intencional;
- 1 pérdida/reintento de conexión.

Registrar duración, resultado, operation ID no sensible, perfil/QR, replay y anomalías. Objetivo: cero
duplicados, cero cambios parciales y menos de cinco minutos por recorrido normal.

## Gate de producción — autorización distinta

No reutilizar cliente, grant, plugin instalado, URL ni tarea staging. Antes de tocar producción se requiere un
mensaje nuevo que autorice explícitamente commit, migración, Worker, dashboard, proyecto Supabase y conexión
OAuth productivos. Ejecutar un único canario designado y revisar auditoría antes de ampliar uso.

## Gates raíz y cierre

```bash
pnpm test
pnpm typecheck
pnpm build
supabase db lint --local
```

Después ejecutar `$speckit-analyze` y `$speckit-converge`. La revisión humana de seguridad/operación no la
autoaprueba el implementador.

## Evidencia de implementación local — 2026-09-24

- API: `286` pruebas, `269` pasaron, `17` opt-in omitidas, `0` fallaron. Incluye firma JWT RS256 real,
  rechazo de claims/clientes y herramientas de setup heredadas.
- Dashboard: `43` pruebas pasaron; typecheck de todos los paquetes y build Vite pasan.
- Se añadieron plugins localeados por ambiente; pruebas validan JSON, URL distinta, ausencia de secretos y
  prohibiciones de operación. No se instalaron ni conectaron.
- No se probó OAuth real con Supabase ni se desplegó Worker/dashboard remoto. Las herramientas MCP v2,
  actualización de perfil e importación de imagen siguen sin existir; esta evidencia no completa la matriz
  de 20 recorridos ni habilita visitas de producción.
