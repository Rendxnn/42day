# Preguntas abiertas

## Criticas antes de construir flujo completo

1. Cerrado: el MVP tendra una sola sede por restaurante.
2. Cerrado: se aceptara domicilio y pickup.
3. Cerrado para MVP: direccion valida minima = texto libre y se mejora cuando el cliente comparte ubicacion.
4. Cerrado: el pedido por transferencia crea `order` con estado `payment_pending_review`.
5. Cerrado: los combos se relacionan con productos existentes mediante `combo_items`.
6. Las promociones aplican automaticamente o solo se muestran como productos/promos seleccionables?
7. Cerrado para MVP: el menu del dia se publica por fecha y por la sede unica del restaurante.
8. Cerrado: si el cliente ya confirmo y el restaurante detecta agotado, la orden queda `needs_customer_replacement`; el backend notifica por WhatsApp con reemplazos activos y deja la conversacion en `awaiting_replacement_selection`.
9. Cerrado: dos intentos de aclaracion antes de handoff.
10. Cerrado: solo `encargado` puede reactivar automatizacion.
11. Cerrado: el dashboard consumira solo nuestro API por ahora.
12. Cerrado: se almacenaran comprobantes desde V1 usando Supabase Storage y metadata en Postgres.
13. Cerrado a nivel de producto: fuera de horario se puede ofrecer preorden explicita.
14. Cerrado: notificacion visual/sonora para pedidos pendientes por confirmar y comprobantes de transferencia detectados.

## Sugerencias de decision MVP

1. Una sola sede por restaurante en MVP.
2. Domicilio y pickup desde V1.
3. Direccion minima: texto libre, con mejora cuando exista ubicacion de WhatsApp.
4. Transferencia: pedir comprobante despues de que el restaurante acepte disponibilidad; luego crear o mantener la orden en `payment_pending_review`, guardar comprobante y generar alerta humana.
5. Combos: entidad propia con precio, pero relacionada con productos existentes mediante `combo_items`.
6. Promociones: seleccionables como item o descuento simple manual/configurado; no motor complejo.
7. Menu del dia por fecha y sede.
8. Si se agota despues de la confirmacion del cliente, el restaurante selecciona el item agotado y hasta 3 reemplazos activos desde el dashboard; el backend guarda metadata, puede marcar el menu item como no disponible, notifica por WhatsApp y espera reemplazo o cancelacion del cliente.
9. Dos intentos de aclaracion antes de handoff.
10. Reactivar automatizacion solo `encargado`, idealmente con un boton simple en dashboard.
11. Dashboard consume API para operaciones sensibles y para la operacion general del MVP.
12. Guardar comprobantes en Supabase Storage desde V1; guardar metadata y relacion con mensaje/orden en Postgres.
13. Mensaje corto y amable de cierre.
14. Notificar: orden nueva, transferencia pendiente, asesor solicitado, error critico.
