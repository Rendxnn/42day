# Quickstart de validación

La implementación está en la rama `staging`. La evidencia marcada como local fue ejecutada el
2026-09-22; la evidencia móvil, accesibilidad independiente y staging siguen siendo gates externos.

## Prerrequisitos

- Supabase local y migraciones aplicadas.
- Fixture `system_admin`.
- 251 perfiles para regresión y 10 000 para rendimiento.
- Un QR disponible y uno activo con revisiones conocidas.
- Cliente OAuth de staging, solo al ejecutar el gate autorizado.

## Inventario

1. Buscar un perfil fuera de los primeros 200.
2. Recorrer páginas con empates de nombre/fecha y cambios concurrentes.
3. Cambiar búsqueda, filtros, orden y tamaño; comprobar reinicio de cursor.
4. Medir 10 000 filas con `EXPLAIN (ANALYZE, BUFFERS)` y el endpoint de staging.

## Modal y retiro

1. Abrir create/edit desde lista y comprobar detalle fresco.
2. Provocar `409` desde otra sesión; no debe sobrescribir.
3. Cerrar con cambios; debe advertir.
4. Deshabilitar perfiles con y sin QRs; comprobar atomicidad/auditoría.
5. Revisar teclado, lector de pantalla, foco, contraste y 320 px.

## Agente

1. Rechazar token ausente/vencido, issuer/audience erróneos, cliente no permitido y usuario sin rol.
2. Preparar y demostrar que no cambió perfil, QR ni auditoría.
3. Rechazar propuesta vencida, manipulada, de otro actor/cliente o con revisión stale.
4. Confirmar: perfil publicado, QR y auditoría consistentes.
5. Repetir `operationId`: `replayed: true`, sin duplicados.
6. Reutilizarlo con otra propuesta: error.

## Gate móvil de staging

1. Verificar firma JWT asimétrica y configurar un cliente OAuth exclusivo de staging, redirect URI
   exacto y ruta de consentimiento.
2. Conectar el plugin privado desde ChatGPT móvil.
3. Iniciar sesión en ParaHoy staging y aprobar OAuth.
4. Compartir negocio, candidatos y código QR.
5. Revisar propuesta/coincidencias/cambio y confirmar.
6. Abrir `/p/:slug` y la URL permanente del QR.
7. Revocar sesión y comprobar rechazo posterior.

No ejecutar contra producción sin autorización nueva y específica.

## Gates del repositorio

```bash
pnpm test
pnpm typecheck
pnpm build
```

Después: `$speckit-analyze`, implementación por fases y `$speckit-converge`. Evidencia manual o
externa no ejecutada se reporta pendiente.

## Evidencia local ejecutada

- `supabase migration up --local --yes` aplicó `20260922050757`, `20260922145316`,
  `20260922190000` y `20260922190001` sobre el stack local.
- `supabase db lint --local --level warning` terminó con `No schema errors found`.
- La RPC `control.list_business_profiles_page` fue leída con orden ascendente/descendente, filtros y
  cursor; el `totalCount` se mantuvo sobre el conjunto filtrado al avanzar.
- `control.commit_business_setup` fue ejecutada con un QR de prueba local: creó, publicó y asignó un
  perfil, escribió auditoría y un segundo llamado con el mismo `operationId` devolvió `replayed: true`
  sin duplicar.
- Typecheck directo de API y dashboard, las 276 pruebas de API (259 pass, 17 skip existentes) y las
  40 pruebas de dashboard pasan. Las pruebas focalizadas del feature incluyen siete casos API/MCP.

## Evidencia todavía requerida

- Carga de 251/10 000 perfiles, `EXPLAIN (ANALYZE, BUFFERS)` y p95 en staging.
- Revisión independiente de `checklists/security-ux.md`, pruebas de RLS/grants con actores reales y
  recorrido de accesibilidad por teclado/lector de pantalla a 320 px.
- Cliente OAuth separado de staging, firma JWT asimétrica real y recorrido desde ChatGPT móvil.
- Pruebas físicas NFC y cualquier migración/despliegue remoto autorizado.
