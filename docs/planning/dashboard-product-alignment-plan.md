# Plan de alineacion del dashboard con el producto

Ultima actualizacion: 2026-04-29.

## Objetivo

Convertir el dashboard en la consola operativa del restaurante para completar el ciclo:

```txt
WhatsApp conversa
-> draft/order se crea
-> restaurante revisa
-> confirma o gestiona pago
-> atiende alertas/handoff
-> actualiza estado del pedido
-> mantiene menu/configuracion del bot
```

## Estado actual del dashboard

Frontend actual:

- React + Vite + Tailwind en `apps/dashboard`.
- Pantallas visuales: `Hoy`, `Resumen`, `Catalogo`, `Subida`.
- Carga tenants desde API con fallbacks locales.
- Gestiona productos basicos y menu del dia.
- Permite upload de imagen de producto cuando la migracion/bucket existen.
- `Subida inteligente` es UI simulada/local; no persiste analisis IA real.

Cliente API actual ya tiene funciones para:

- tenants,
- menu de hoy,
- productos,
- items de menu,
- ordenes,
- detalle de orden,
- cambio de estado,
- alertas,
- acknowledge/resolve de alertas,
- settings de automatizacion.

Backend API actual expone rutas para:

- `GET /dashboard/:tenantSlug/orders`
- `GET /dashboard/:tenantSlug/orders/:orderId`
- `PATCH /dashboard/:tenantSlug/orders/:orderId/status`
- `GET /dashboard/:tenantSlug/alerts`
- `PATCH /dashboard/:tenantSlug/alerts/:alertId/acknowledge`
- `PATCH /dashboard/:tenantSlug/alerts/:alertId/resolve`
- `GET/PATCH /dashboard/:tenantSlug/settings/automation`

Brecha principal:

El backend ya expone contratos operativos, pero el frontend todavia no tiene la consola visual de ordenes, alertas, seguimiento, conversacion ni automatizacion.

## Prioridad 1. Operacion diaria

### 1. Bandeja de pedidos

Agregar una vista `Pedidos` como primera pantalla operativa o pestana principal.

Debe mostrar:

- pedidos pendientes de confirmacion,
- pedidos activos,
- historial,
- filtro por estado,
- filtro por metodo de pago,
- contador de transferencias pendientes,
- contador de alertas abiertas,
- hora de creacion,
- cliente/telefono,
- total,
- fulfillment: domicilio/pickup,
- estado actual.

Usar:

- `listOrders(tenantSlug, bucket)`.

Buckets existentes:

- `pending_confirmation`
- `active`
- `history`
- `all`

### 2. Detalle de pedido

Al seleccionar un pedido, abrir panel o ruta de detalle.

Debe mostrar:

- items,
- cantidades,
- opciones/notas cuando existan,
- subtotal,
- domicilio,
- total,
- metodo de pago,
- direccion,
- telefono del cliente,
- fechas,
- estado,
- flags de `restaurantConfirmedAt` y `paymentConfirmedAt`.

Usar:

- `getOrder(tenantSlug, orderId)`.

### 3. Acciones operativas de pedido

Agregar botones segun estado:

- confirmar pedido del restaurante,
- marcar pago confirmado,
- aceptar,
- preparar,
- enviar/en camino,
- entregar,
- cancelar.

Usar:

- `updateOrderStatus`.

Reglas UX recomendadas:

- si `paymentMethod = transfer` y no hay `paymentConfirmedAt`, destacar pago pendiente,
- si no hay `restaurantConfirmedAt`, mostrar como accion primaria `Confirmar pedido`,
- no ocultar estados de error; mostrar mensaje accionable.

## Prioridad 2. Alertas y handoff

### 4. Bandeja de alertas

Agregar vista `Alertas`.

Debe mostrar:

- tipo,
- titulo,
- descripcion,
- estado,
- order relacionado,
- draft relacionado,
- conversation relacionada,
- fecha,
- prioridad visual.

Tipos relevantes:

- `order_pending_confirmation`
- `support_requested`
- `transfer_payment_review`
- `parser_failed`
- `validation_failed_repeatedly`
- `technical_error`
- `order_change_requested`
- `automation_disabled`

Usar:

- `listAlerts`.
- `acknowledgeAlert`.
- `resolveAlert`.

### 5. Detalle de alerta con contexto

Agregar panel de alerta:

- pedido asociado si existe,
- cliente,
- mensajes recientes cuando exista endpoint,
- motivo,
- acciones sugeridas.

Brecha backend:

- falta endpoint de mensajes por conversacion.
- falta endpoint para reactivar automatizacion por conversacion manual.

Propuesta API:

```txt
GET   /dashboard/:tenantSlug/conversations/:conversationId/messages
PATCH /dashboard/:tenantSlug/conversations/:conversationId/automation
POST  /dashboard/:tenantSlug/conversations/:conversationId/outbound
```

## Prioridad 3. Conversacion y trazabilidad

### 6. Timeline de conversacion

Agregar vista o panel de mensajes por pedido/conversacion.

Debe mostrar:

- inbound/outbound,
- hora,
- tipo de mensaje,
- texto,
- media/comprobante si existe,
- estado de envio,
- cambios de estado relevantes.

Esto es clave para que el restaurante entienda por que el bot creo una orden o pidio handoff.

Brecha backend:

- hoy se guardan mensajes, pero no hay endpoint dashboard para consultarlos.

### 7. Eventos/auditoria

Agregar timeline de eventos operativos:

- order created,
- restaurant confirmed,
- payment confirmed,
- alert created,
- alert resolved,
- automation disabled/enabled,
- handoff created.

Brecha backend:

- `AppEvent` existe como tipo, pero no hay modulo persistente completo de eventos.

## Prioridad 4. Automatizacion

### 8. Control de automatizacion

Agregar control visible:

- automation on/off para tenant/location,
- razon opcional al apagar,
- estado actual,
- advertencia de que apagado no responde automaticamente.

Usar:

- `getAutomationSettings`.
- `updateAutomationSettings`.

Regla de producto:

- solo `encargado` deberia activar/desactivar automatizacion cuando existan roles reales.

### 9. Conversaciones manuales

Agregar bandeja o filtro:

- conversaciones en `manual`,
- motivo,
- ultimo mensaje,
- accion para marcar atendida,
- accion futura para reactivar bot.

Brecha backend:

- hace falta endpoint para listar conversaciones manuales.

Propuesta API:

```txt
GET /dashboard/:tenantSlug/conversations?state=manual
PATCH /dashboard/:tenantSlug/conversations/:conversationId/state
```

## Prioridad 5. Menu para conversacion natural

### 10. Aliases de productos

Para mejorar el matcher deterministico, el dashboard debe permitir configurar aliases.

Ejemplo:

```txt
Producto: Almuerzo del dia
Aliases: menu del dia, almuerzo, corrientazo
```

Brecha backend/db:

- productos/menu items no exponen aliases todavia en tipos/API.
- decision actual: guardarlos primero en BD y luego exponer UI para administrarlos.

Para que sirven:

- aceptar nombres reales usados por clientes,
- mejorar matching deterministico,
- reducir llamadas LLM,
- resolver opciones configurables sin obligar texto exacto,
- definir cuando aclarar por ambiguedad.

### 11. Productos configurables

Agregar UI para productos tipo "arma tu plato":

- grupos de opciones,
- requerido/opcional,
- min/max selecciones,
- valores por grupo,
- aliases por valor,
- orden visual,
- extras con precio si se decide incluirlos.

Ejemplo:

```txt
Producto: Menu del dia
Grupo requerido: sopa
Opciones: frijoles, verduras, lentejas
Grupo requerido: proteina
Opciones: pollo, carne, cerdo
```

Depende de:

- usar la migracion ya aplicada `extend_product_options_for_deterministic_configurables`,
- extender tipos compartidos,
- extender rutas dashboard.

### 12. Disponibilidad operativa

El dashboard debe permitir:

- marcar producto agotado,
- marcar opcion agotada,
- ajustar cantidad disponible,
- cambiar precio del dia,
- ocultar temporalmente item.

Esto es necesario para evitar que el bot venda algo agotado.

## Prioridad 6. Transferencias y comprobantes

### 13. Revision de comprobante

Agregar UI para:

- ver comprobante,
- abrir archivo,
- marcar pago valido,
- marcar pago invalido,
- pedir nuevo comprobante manualmente.

Brecha backend:

- falta descarga de media desde Meta,
- falta upload a `payment-proofs`,
- falta metadata/file relation con `orders.payment_proof_file_id`.

### 14. Datos de transferencia

Agregar configuracion visible:

- instrucciones de pago,
- cuenta/banco/nequi/daviplata,
- texto que el bot debe enviar.

Brecha actual:

- existe columna/configuracion planeada, falta UI completa y uso conversacional real.

## Prioridad 7. Roles y seguridad

### 15. Roles

Roles definidos:

- `encargado`,
- `trabajador`.

Permisos sugeridos:

- encargado: automatizacion, menu, productos, confirmar/cancelar, pagos, configuracion.
- trabajador: ver pedidos, cambiar estados operativos, atender alertas asignadas.

Brecha actual:

- no hay login/roles reales en dashboard.

## Orden recomendado para el companero de dashboard

1. Agregar navegacion principal: `Pedidos`, `Alertas`, `Menu`, `Catalogo`, `Ajustes`.
2. Implementar bandeja de pedidos usando `listOrders`.
3. Implementar detalle de pedido usando `getOrder`.
4. Implementar acciones de estado usando `updateOrderStatus`.
5. Implementar bandeja de alertas usando `listAlerts`.
6. Implementar acknowledge/resolve.
7. Agregar control de automatizacion.
8. Pedir/consumir endpoint de mensajes por conversacion.
9. Agregar timeline de conversacion.
10. Agregar UI de aliases.
11. Agregar UI de productos configurables.
12. Agregar UI de comprobantes cuando backend guarde media.

## Criterio de listo para flujo completo

El dashboard esta alineado con el producto cuando un restaurante puede:

- ver un pedido que llego por WhatsApp,
- revisar su detalle y conversacion,
- confirmar que lo acepta,
- revisar pago por transferencia si aplica,
- marcar estados operativos,
- resolver alertas,
- apagar/encender automatizacion,
- actualizar menu y disponibilidad sin tocar base de datos.
