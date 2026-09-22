# Plan

La migración reserva la tabla de idempotencia y enlaza los eventos de auditoría al lote. La RPC y la UI no se mezclan con el modelo de perfiles: la operación recibe un target previamente validado. La API calcula un hash SHA-256 canónico, el preflight consulta las unidades por ID y la RPC aplica todo-o-nada con locks ordenados por UUID. El navegador conserva únicamente la selección y las revisiones esperadas.

La primera entrega incluye endpoints REST y una sesión de selección en el dashboard. La exportación, el salto arbitrario de página y la programación NFC quedan fuera de este feature.
