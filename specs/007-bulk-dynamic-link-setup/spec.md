# Especificación: configuración masiva de Dynamic Links

**Estado:** aprobado para implementación local/staging; certificación externa pendiente.

Una sesión escanea y deduplica entre 2 y 100 unidades. Un preflight clasifica elegibles, archivadas y activas protegidas; las activas requieren consentimiento individual. Una operación final usa un UUID idempotente, revisiones esperadas y todo-o-nada. Cada unidad mantiene su URL permanente y etiqueta, cambia únicamente el destino dinámico y recibe auditoría asociada a la operación. Los perfiles en borrador se publican dentro de la misma transacción antes de asignarse.

## Requisitos funcionales

- **RF-007-01:** la sesión acepta códigos escaneados o introducidos manualmente, deduplica por unidad y limita la selección a 100.
- **RF-007-02:** el preflight devuelve elegibles, protegidas y excluidas con código, estado, revisión y destino actual.
- **RF-007-03:** una unidad activa queda excluida por defecto y solo se incluye con consentimiento explícito por unidad.
- **RF-007-04:** la aplicación valida todas las revisiones y bloquea las filas en orden estable; cualquier conflicto revierte todo el lote.
- **RF-007-05:** el `operationId` y hash del comando hacen los reintentos idempotentes; reutilizar el ID con otro payload falla.
- **RF-007-06:** el target puede ser un perfil canónico o una redirección validada y no modifica la URL pública permanente.

## Criterios de aceptación

- No hay duplicados ni omisiones al recorrer entre 2 y 100 unidades.
- Un archivado, revisión obsoleta o consentimiento ausente impide cualquier cambio del lote.
- Un reintento idéntico devuelve el resultado anterior sin duplicar auditoría.
- El preflight y la operación final se ejecutan mediante el backend, nunca desde Supabase en el navegador.

## Gates pendientes

- RPC transaccional con bloqueos en orden estable, validación de perfiles draft y hash de comando.
- API preflight/final y sesión de escáner múltiple.
- Pruebas de rollback, reintento idempotente y concurrencia.
- Revisión independiente del checklist y convergencia Spec Kit.
