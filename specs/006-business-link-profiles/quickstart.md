# Quickstart de validación: perfiles ligeros

## Prerrequisitos

- Supabase local iniciado con todas las migraciones.
- Usuario `system_admin` no productivo y un tenant con `encargado` de prueba.
- Worker/dashboard locales configurados con claves no productivas.

## Recorridos

1. Crear un perfil genérico con Instagram, web y WhatsApp guardados; habilitar solo web y WhatsApp.
   Antes de publicar, `GET` público debe devolver 404.
2. Publicar el perfil y abrir `/p/:slug`; confirmar que no se ven Instagram ni datos internos.
3. Crear un tenant con sede activa, ejecutar el backfill y editar ajustes públicos como `encargado`.
   Confirmar que `/r/:tenantSlug` sigue respondiendo y las columnas legacy permanecen alineadas.
4. Asociar dos unidades QR activas a un perfil publicado. La deshabilitación ordinaria debe fallar;
   `disable-and-suspend` debe suspender ambas, conservar sus URL permanentes y dejar dos auditorías.
5. Probar manager de otro tenant, perfil borrador, enlace HTTP, teléfono inválido, reseña sin confirmar,
   slug duplicado y revisión stale.

## Gates

- Ejecutar las pruebas focalizadas API/dashboard, typecheck y build de workspaces.
- Ejecutar las pruebas de RLS, grants, RPC y atomicidad en Supabase local.
- La migración ya fue aplicada a `42day-staging` con autorización explícita; la revisión independiente y
  los recorridos con datos no productivos siguen siendo requisito antes de promover el código.

## Evidencia registrada

- **2026-09-22, local:** `business-link-profiles.sql` pasó con creación idempotente, actualización de
  enlaces visibles/ocultos, publicación, conteo de QRs y suspensión con auditoría; la prueba de paginación
  de la fase 1 también pasó. `supabase db lint --local` no reportó errores.
- **2026-09-22, staging `42day-staging` (`jcruwwluxlhhwedvciog`):** se aplicó
  `20260922050757_complete_business_link_profiles`. La migración aparece en `supabase migration list
  --linked`; las tablas canónicas tienen RLS y force RLS activos, y las cinco RPC críticas no son
  ejecutables por `anon`/`authenticated`.
- **Pruebas focalizadas:** 27 pruebas API, 4 de dashboard, 5 de core y typecheck de API, dashboard, core
  y types pasan. `pnpm`/build raíz y los recorridos con datos reales de staging siguen pendientes por el
  gate del runtime y porque staging todavía no tiene tenants de aceptación.
- **2026-09-22, despliegue staging:** Worker `42day-api-staging` y dashboard Vercel fueron publicados;
  `https://staging.parahoy.thaledon.com` responde con el bundle que apunta al Supabase de staging. Health,
  CORS, sesión admin, inventario y la pantalla de perfiles fueron comprobados manualmente.
- **Pendiente de revisión independiente:** manager de otro tenant, backfill real con sede, stale/todo-o-nada
  completo, checklist de requisitos y compatibilidad visual del editor de restaurante.
