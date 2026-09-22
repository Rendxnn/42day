# Quickstart de validación

1. Crear 251 unidades locales y solicitar 25 por `updatedAt desc`.
2. Buscar la última por código, navegar siguiente/anterior y cambiar el tamaño a 100.
3. Abrir una activa, confirmar que inicia en lectura y que editar vuelve a consultar su revisión.
4. Provocar `dynamic_link_stale`; confirmar que no se guarda ni rehidrata automáticamente.
5. Ejecutar `node --experimental-loader ./headless/resolve-loader.mjs --test --experimental-strip-types --experimental-specifier-resolution=node test/dynamic-links.test.mjs` desde `apps/api` y `node --test --experimental-strip-types test/dynamic-link-quick-setup.test.mjs` desde `apps/dashboard`.
6. Ejecutar `psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/dynamic-link-pagination.sql` y registrar `EXPLAIN ANALYZE` sobre datos representativos.

## Evidencia registrada

- **2026-09-22, staging:** la migración `20260922003645` aparece aplicada en el proyecto de staging y
  la sesión de `system_admin` pudo abrir el inventario QR/NFC desde
  `https://staging.parahoy.thaledon.com`.
- **Validado localmente:** 251 unidades sintéticas dentro de una transacción, búsqueda filtrada,
  primera página, cursor siguiente y rechazo de tamaño inválido; `EXPLAIN ANALYZE` usa
  `dynamic_link_units_updated_id_idx`. La revisión independiente de más de 250 unidades, exportación,
  teclado, lector de pantalla, contraste y viewport de 320 px continúa pendiente.
