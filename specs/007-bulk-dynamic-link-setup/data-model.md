# Modelo de datos — configuración masiva

`control.dynamic_link_bulk_operations` conserva `operation_id`, actor, hash SHA-256, resultado y marcas de tiempo. `control.dynamic_link_audit_events.bulk_operation_id` relaciona cada cambio con la operación. Las filas tienen RLS forzado y solo `service_role` puede invocar la RPC.
