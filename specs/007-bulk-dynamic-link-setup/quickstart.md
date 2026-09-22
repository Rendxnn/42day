# Quickstart — configuración masiva

1. Aplicar migraciones en el proyecto staging enlazado: `supabase db push --linked`.
2. Arrancar API y dashboard staging.
3. Abrir Inventario QR/NFC, seleccionar `Configurar varios`, agregar 2 unidades y ejecutar preflight.
4. Confirmar que los activos requieren selección individual y que el resultado conserva las URLs permanentes.
5. Repetir la misma operación para verificar idempotencia; modificar una revisión para comprobar rollback.
