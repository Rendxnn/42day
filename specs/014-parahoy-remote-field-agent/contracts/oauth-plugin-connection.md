# Contrato: OAuth y plugins ParaHoy

## Topología por ambiente

| Elemento | Staging | Producción |
| --- | --- | --- |
| Plugin visible | `ParaHoy Prospectos — STAGING` | `ParaHoy Prospectos — PRODUCCIÓN` |
| Identificador | `parahoy-prospectos-staging` | `parahoy-prospectos-production` |
| MCP | Worker staging + `/mcp` | Worker production + `/mcp` |
| Supabase issuer | proyecto staging + `/auth/v1` | proyecto production + `/auth/v1` |
| OAuth client | público, PKCE, exclusivo | público, PKCE, exclusivo y distinto |
| Allowlist | solo client ID staging | solo client ID production |

El código puede contener los manifests y URLs públicas. El plugin no contiene secretos ni un token preemitido.
La instalación/conexión productiva no se ejecuta durante implementación local o rollout de staging.

## Paquete

Durante implementación se invoca `$plugin-creator` y se conserva la estructura que genere la versión instalada
de Codex. Como mínimo, cada paquete contiene:

```text
plugins/parahoy-prospectos-<environment>/
  .codex-plugin/plugin.json
  .mcp.json
  skills/create-or-update-prospect-profile/SKILL.md
  skills/create-or-update-prospect-profile/references/
    confirmation-template.md
    source-policy.md
```

Si `plugin-creator` genera además el manifest portable raíz, se conserva como fuente y la compatibilidad queda
derivada; no se renombra manualmente `.mcp.json` a `mcp.json`. Ambos paquetes contienen el mismo workflow salvo
nombre, ambiente esperado y URL MCP. Un test compara las reglas de seguridad comunes para evitar divergencia.

## Protected Resource Metadata

El Worker sirve:

```http
GET /.well-known/oauth-protected-resource
Cache-Control: public, max-age=300
Content-Type: application/json
```

```json
{
  "resource": "https://<worker-host>/mcp",
  "authorization_servers": ["https://<project-ref>.supabase.co/auth/v1"],
  "scopes_supported": ["openid", "email", "profile"]
}
```

`resource` coincide exactamente con `MCP_RESOURCE_URL`. El Worker no publica metadata inventada de authorization
server. El cliente sigue el discovery oficial de Supabase:

```text
https://<project-ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1
```

## Challenge

Toda llamada sin token o con token inválido devuelve:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://<worker-host>/.well-known/oauth-protected-resource"
```

Puede agregar `error="invalid_token"`; no incluye descripción sensible. Falta de rol o cliente allowlisted usa
`403` y no desafía un nuevo login como si fuera un token ausente.

## Consentimiento dashboard

Ruta: `/oauth/consent?authorization_id=<opaque>`.

Secuencia:

1. Validar que existe un único `authorization_id` no vacío; no loguearlo.
2. Si no hay sesión, redirigir al login preservando solo este parámetro y una ruta de retorno interna
   allowlisted.
3. Tras login, llamar `supabase.auth.oauth.getAuthorizationDetails(authorizationId)`.
4. Mostrar nombre del cliente, ambiente visible, scopes solicitados y estas capacidades:
   - leer inventario/perfiles;
   - preparar propuestas;
   - crear/publicar/asignar tras confirmación;
   - actualizar perfiles tras confirmación.
5. `Aprobar` llama `approveAuthorization`; `Denegar`, `denyAuthorization`.
6. El retorno lo controla Supabase; el dashboard no construye el redirect URI.

La pantalla no promete acceso por scope a acciones ParaHoy: explica que cada llamada también valida rol y
cliente. No muestra client secret. Debe ser accesible a 320 px, teclado y lector de pantalla.

## Validación JWT

Para cada llamada:

1. Extraer bearer sin loguearlo.
2. Leer header/payload solo como datos no confiables.
3. Obtener JWKS del issuer configurado y verificar firma `RS256` o `ES256`, `kid` y algoritmo.
4. Comparar `iss` exacto y `aud` exacta/miembro del array con binding.
5. Validar `exp`; aceptar `nbf` si existe con tolerancia máxima de 60 s.
6. Exigir `sub` UUID y que `requireAuthUser` obtenga el mismo usuario.
7. Extraer `client_id` (no usar `azp` como fallback en v2) y buscarlo en allowlist no vacía.
8. Consultar rol `system_admin` vigente.

El cache JWKS respeta un máximo de cinco minutos y reintenta una vez con refresh ante `kid` desconocido para
permitir rotación. Fallo de JWKS devuelve indisponibilidad controlada, nunca salta verificación.

## Bootstrap controlado de DCR

DCR es un procedimiento operativo, no un modo permanente:

1. Configurar Site URL y `/oauth/consent` del ambiente.
2. Habilitar OAuth server y DCR en staging.
3. Instalar/conectar únicamente el plugin staging.
4. Capturar el cliente creado desde el panel/API administrativa de Supabase, no desde logs del token.
5. Verificar nombre y redirect URIs creadas por Codex.
6. Configurar el ID en `MCP_ALLOWED_CLIENT_IDS` del Worker staging.
7. Deshabilitar DCR y probar reconexión/refresh.
8. Revocar clientes desconocidos/de prueba.

Producción repite el procedimiento desde cero solo tras autorización explícita. No se copia una contraseña,
client secret ni refresh token entre proyectos.

## Revocación

El runbook debe permitir:

- revocar el grant del usuario/cliente;
- retirar el `client_id` de la allowlist;
- revocar/eliminar el cliente OAuth si se pierde el dispositivo o deja de usarse;
- volver a conectar mediante un grant nuevo.

La revocación de una conexión no elimina perfiles ni operaciones ya auditadas.
