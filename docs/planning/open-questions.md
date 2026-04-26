# Preguntas abiertas

## Criticas antes de construir flujo completo

1. Cerrado: el MVP tendra una sola sede por restaurante.
2. Cerrado: se aceptara domicilio y pickup.
3. Cerrado para MVP: direccion valida minima = texto libre y se mejora cuando el cliente comparte ubicacion.
4. Cerrado: el pedido por transferencia crea `order` con estado `payment_pending_review`.
5. Cerrado: los combos se relacionan con productos existentes mediante componentes del combo.
6. ¿Las promociones aplican automaticamente o solo se muestran como productos/promos seleccionables?
7. Cerrado para MVP: el menu del dia se publica por fecha y por la sede unica del restaurante.
8. Cerrado: si se agota al confirmar, el restaurante lo marca y el sistema retoma el flujo con disculpa y permite editar el pedido con productos disponibles.
9. Cerrado: dos intentos de aclaracion antes de handoff.
10. Cerrado: solo `encargado` puede reactivar automatizacion.
11. Cerrado: el dashboard consumira solo nuestro API por ahora.
12. Cerrado: se almacenaran comprobantes desde V1 usando Supabase Storage y metadata en Postgres.
13. Cerrado a nivel de producto: fuera de horario se puede ofrecer preorden explicita.
14. ¿Que eventos deben generar notificacion visual/sonora en dashboard?

## Sugerencias de decision MVP

1. Una sola sede por restaurante en MVP.
2. Domicilio y pickup desde V1.
3. Direccion minima: texto libre, con mejora cuando exista ubicacion de WhatsApp.
4. Transferencia: crear orden con estado `payment_pending_review` despues de confirmacion del cliente, guardar comprobante y generar alerta humana.
5. Combos: entidad propia con precio, pero relacionada con productos existentes mediante `combo_items`.
6. Promociones: seleccionables como item o descuento simple manual/configurado; no motor complejo.
7. Menu del dia por fecha y sede.
8. Si se agota al confirmar, el sistema bloquea el cierre, envia disculpa y retoma el flujo para cambiar por productos disponibles.
9. Dos intentos de aclaracion antes de handoff.
10. Reactivar automatizacion solo `encargado`, idealmente con un boton simple en dashboard.
11. Dashboard consume API para operaciones sensibles y para la operacion general del MVP.
12. Guardar comprobantes en Supabase Storage desde V1; guardar metadata y relacion con mensaje/orden en Postgres.
13. Mensaje corto y amable de cierre.
14. Notificar: orden nueva, transferencia pendiente, asesor solicitado, error critico.
