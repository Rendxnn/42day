# Especificación: configuración masiva de Dynamic Links

**Estado:** preparado para revisión e implementación por fases.

Una sesión escanea y deduplica entre 2 y 100 unidades. Un preflight clasifica elegibles, archivadas y activas protegidas; las activas requieren consentimiento individual. Una operación final usa un UUID idempotente, revisiones esperadas y todo-o-nada. Cada unidad mantiene URL y etiqueta y recibe auditoría asociada a la operación.

## Gates pendientes

- RPC transaccional con bloqueos en orden estable, validación de perfiles draft y hash de comando.
- API preflight/final y sesión de escáner múltiple.
- Pruebas de rollback, reintento idempotente y concurrencia.
