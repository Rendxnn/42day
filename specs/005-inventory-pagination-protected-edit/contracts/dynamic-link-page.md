# Contrato de inventario

`GET /dashboard/admin/dynamic-links?query=&status=&tenantId=&batchId=&sort=updatedAt&direction=desc&pageSize=25&cursor=`

Devuelve `{ units, totalCount, pageInfo: { hasNext, nextCursor? } }`. `pageSize` es 25, 50 o 100; el cursor no puede reutilizarse con filtros, orden, dirección o tamaño distintos. Sort permitido: `updatedAt`, `createdAt`, `code`, `label`, `status`.
