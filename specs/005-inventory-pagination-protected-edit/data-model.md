# Modelo de datos

No se añade una entidad. `control.dynamic_link_units` conserva su revisión y estados. Se añaden índices para los órdenes permitidos y búsqueda. El cursor no persiste: es JSON opaco con valor de orden, `id` y huella de consulta validada por el servidor.
