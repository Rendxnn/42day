# Quickstart de validación

1. Crear 251 unidades locales y solicitar 25 por `updatedAt desc`.
2. Buscar la última por código, navegar siguiente/anterior y cambiar el tamaño a 100.
3. Abrir una activa, confirmar que inicia en lectura y que editar vuelve a consultar su revisión.
4. Provocar `dynamic_link_stale`; confirmar que no se guarda ni rehidrata automáticamente.
5. Ejecutar `pnpm --filter @42day/api test`, `pnpm --filter @42day/dashboard test`, typecheck/build focalizados y luego los gates raíz.
