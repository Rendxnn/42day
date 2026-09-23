# Investigación y decisiones

## Inventario paginado

**Decisión**: reutilizar la paginación keyset de Dynamic Links: cursor opaco con huella de búsqueda,
filtros, orden, dirección y tamaño; campo ordenado más `id` como desempate.

**Razón**: evita el límite 200 y conserva navegación estable con escrituras concurrentes. La UI
mantendrá una pila de cursores para `Anterior`; no habrá salto arbitrario de página.

**Alternativas descartadas**: `offset/limit` puede omitir/duplicar ante cambios concurrentes; cargar
todo en el navegador repite el defecto actual. La búsqueda será case-insensitive. Se medirá con
`EXPLAIN (ANALYZE, BUFFERS)` antes de incluir `pg_trgm`.

## Semántica de eliminación

**Decisión**: no crear `DELETE`. La UI usará `Deshabilitar perfil` y la operación existente de
deshabilitación/suspensión atómica.

**Razón**: un perfil puede ser destino de URLs públicas y QRs físicos; hard delete rompería
referencias y auditoría. `disabled` ya representa el retiro.

## Integración del agente

**Decisión**: MCP HTTPS en el Worker existente, empaquetable como plugin privado de ChatGPT/Codex,
con herramientas pequeñas de lectura, preparación y confirmación.

**Razón**: la arquitectura oficial recomienda MCP para conectar servicios autenticados y exponer
herramientas con esquemas/resultados estructurados. El backend conserva autorización y reglas.
Fuentes: [arquitectura de plugins](https://developers.openai.com/plugins/concepts/plugins) y
[servidor MCP](https://developers.openai.com/plugins/build/mcp-server).

**Alternativas descartadas**: una sesión remota en el Mac depende de una máquina y es poco auditable;
entregar credenciales al modelo es inadmisible; un REST genérico pierde esquemas y controles.

ChatGPT investiga enlaces públicos con sus capacidades disponibles. ParaHoy solo normaliza, valida,
detecta coincidencias y prepara el cambio; no se construye un scraper.

## Autenticación

**Decisión**: Supabase Auth como OAuth 2.1 Authorization Code + PKCE, consentimiento en
`/oauth/consent`, cliente preregistrado y redirect URI exacto por ambiente. No se habilita registro
dinámico abierto inicialmente.

**Razón**: ChatGPT soporta OAuth/PKCE y exige validar issuer, audience, expiración y scopes. Supabase
reutiliza los usuarios existentes como servidor OAuth. Fuentes:
[autenticación de plugins](https://developers.openai.com/plugins/build/auth),
[OAuth 2.1 de Supabase](https://supabase.com/docs/guides/auth/oauth-server) y
[MCP con Supabase Auth](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication).

Los scopes de identidad no autorizan ParaHoy. El Worker valida JWT/JWKS, `iss`, `aud`, `exp`,
`client_id` permitido y `system_admin`. Staging y producción usan clientes distintos, conforme a
[seguridad de tokens](https://supabase.com/docs/guides/auth/oauth-server/token-security).

**Alternativas descartadas**: API key compartida no identifica ni revoca por persona; consultar solo
`/auth/v1/user` no demuestra audiencia/cliente; DCR abierto amplía clientes innecesariamente.

## Confirmación e idempotencia

**Decisión**: `prepare_business_setup` crea propuesta opaca de diez minutos sin mutaciones;
`commit_business_setup` requiere `operationId`, token y confirmación. Una RPC bloquea filas en orden
estable y aplica todo-o-nada.

**Razón**: las herramientas consecuenciales deben declarar riesgo, autorizarse en servidor y pedir
confirmación. Una sola herramienta create facilita accidentes; llamadas separadas dejan parciales.

## Dependencias

**Decisión**: añadir `@modelcontextprotocol/sdk` y `jose` al API, versiones exactas resueltas por pnpm.

**Razón**: evita implementar manualmente MCP y JWT/JWKS. Ambas se probarán en Cloudflare Workers antes
del flujo completo.

