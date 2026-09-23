# API de ParaHoy

Worker de Cloudflare que recibe WhatsApp, orquesta pedidos y expone la API autenticada del dashboard y los endpoints públicos de Presencia Digital. El nombre técnico del paquete continúa siendo `@42day/api`.

## Responsabilidades

- Verificar y procesar webhooks de Meta.
- Resolver tenant, conversación y estado vigente.
- Transcribir audio y enviar todo texto conversacional al intérprete de IA —dirección objetivo; consulta la deuda actual en [Estado](../../docs/current-status.md).
- Validar y ejecutar acciones controladas sobre drafts y órdenes.
- Operar catálogo, menú, pagos, cobertura, alertas, notificaciones y configuración.
- Servir perfil, carta y concierge públicos.
- Resolver enlaces físicos QR/NFC bajo `go.thaledon.com/r/:code`, inventario paginado, auditoría y configuración protegida de enlaces activos. El handoff activo de escritura genera un enlace de Atajos para NFC.cool con la URL permanente; NFC Helper permanece como adaptador legado deshabilitado y no se emiten nuevas sesiones/callbacks.
- Administrar perfiles ligeros en `features/public-profile`: borrador/publicación, enlaces activables,
  backfill compatible de restaurantes y suspensión atómica de QRs antes de deshabilitar un perfil.
- Validar perfiles con límites compartidos y respuestas controladas (`error`, `message`, `field`); los
  teléfonos aceptan formatos internacionales con separadores, pero deben contener entre 7 y 15 dígitos.
  Los enlaces desactivados pueden permanecer sin URL y no bloquean el guardado.
- Exponer el inventario paginado de perfiles (`/dashboard/admin/business-profiles`) con búsqueda,
  filtros y cursores, además del puente MCP privado (`POST /mcp`) para que un agente prepare y confirme
  una configuración de negocio desde una conversación móvil. El puente exige JWT de Supabase,
  `system_admin`, cliente permitido y una confirmación idempotente separada de la preparación.
- Integrar Supabase Postgres/Auth/Storage/Realtime y proveedores de IA.

## Entradas principales

- `src/index.ts`: composición de Hono.
- `src/modules/whatsapp-webhook/`: webhook y normalización.
- `src/features/chat-routing/`: orquestación conversacional.
- `src/features/dashboard/`: rutas del dashboard y endpoints públicos.
- `src/features/carta-concierge/` y `src/features/public-profile/`: Presencia Digital.
- `src/features/dynamic-links/`: enlaces permanentes QR/NFC, inventario global y resolver de reseñas.
- `src/features/public-profile/`: perfiles canónicos `/p/:slug`, alias de restaurante y autorización de
  administración/encargados. El dashboard nunca consulta `control` directamente.

Las fachadas históricas bajo `src/modules/` pueden reexportar implementaciones nuevas; no deben recibir lógica adicional si existe un feature dueño de esa capacidad.

## Desarrollo

```bash
pnpm --filter @42day/api dev
pnpm --filter @42day/api typecheck
pnpm --filter @42day/api test
```

Variables requeridas o usadas según la capacidad:

```text
APP_BASE_URL
DYNAMIC_LINK_BASE_URL
DASHBOARD_ALLOWED_ORIGINS
MCP_OAUTH_ISSUER
MCP_JWT_AUDIENCE
MCP_ALLOWED_CLIENT_IDS
MCP_RESOURCE_URL
META_VERIFY_TOKEN
META_ACCESS_TOKEN
META_PHONE_NUMBER_ID
META_WABA_ID
META_GRAPH_API_VERSION
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
GEMINI_MODEL
OPENAI_API_KEY
OPENAI_TRANSCRIPTION_MODEL
AUDIO_TRANSCRIPTION_PROVIDER
```

`SUPABASE_SERVICE_ROLE_KEY` y las claves de proveedores son secretos exclusivos del backend.

## Documentación relacionada

- [Arquitectura backend](../../docs/architecture/backend.md)
- [Flujo conversacional](../../docs/flows/conversation-flow.md)
- [Integración con WhatsApp](../../docs/integrations/whatsapp-cloud-api.md)
- [Despliegue](../../docs/runbooks/deployment.md)
- [Feature 009: perfiles y acciones del agente](../../specs/009-profile-management-agent-actions/spec.md)
- [Feature 010: validación y errores comprensibles](../../specs/010-profile-validation-errors/spec.md)
