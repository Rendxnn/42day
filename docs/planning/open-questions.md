# Preguntas abiertas

## Criticas antes de construir flujo completo

1. Cerrado: el MVP tendra una sola sede por restaurante.
2. Cerrado: se aceptara domicilio y pickup.
3. Que datos minimos debe tener una direccion valida?
4. Cerrado: el pedido por transferencia crea `order` con estado `payment_pending_review`.
5. Cerrado: los combos se relacionan con productos existentes mediante `combo_items`.
6. Las promociones aplican automaticamente o solo se muestran como productos/promos seleccionables?
7. Cerrado para MVP: el menu del dia se publica por fecha y por la sede unica del restaurante.
8. Cerrado: si el cliente ya confirmo y el restaurante detecta agotado, la orden queda `needs_customer_replacement`; el backend notifica por WhatsApp con reemplazos activos y deja la conversacion en `awaiting_replacement_selection`.
9. Cuantos intentos de aclaracion se permiten antes de handoff?
10. Quien puede reactivar automatizacion: encargado solamente o tambien trabajador?
11. El dashboard consumira solo nuestro API o tambien Supabase directo?
12. Cerrado: se almacenaran comprobantes desde V1 usando Supabase Storage y metadata en Postgres.
13. Que mensaje exacto se envia cuando la sesion expira?
14. Que eventos deben generar notificacion visual/sonora en dashboard?

## Sugerencias de decision MVP

1. Una sola sede por restaurante en MVP.
2. Domicilio y pickup desde V1.
3. Direccion minima: texto libre + barrio opcional + referencia opcional.
4. Transferencia: pedir comprobante despues de que el restaurante acepte disponibilidad; luego crear o mantener la orden en `payment_pending_review`, guardar comprobante y generar alerta humana.
5. Combos: entidad propia con precio, pero relacionada con productos existentes mediante `combo_items`.
6. Promociones: seleccionables como item o descuento simple manual/configurado; no motor complejo.
7. Menu del dia por fecha y sede.
8. Si se agota despues de la confirmacion del cliente, el restaurante selecciona el item agotado y hasta 3 reemplazos activos desde el dashboard; el backend guarda metadata, puede marcar el menu item como no disponible, notifica por WhatsApp y espera reemplazo o cancelacion del cliente.
9. Dos intentos de aclaracion antes de handoff.
10. Reactivar automatizacion solo `encargado`.
11. Dashboard consume API para operaciones sensibles.
12. Guardar comprobantes en Supabase Storage desde V1; guardar metadata y relacion con mensaje/orden en Postgres.
13. Mensaje corto y amable de cierre.
14. Notificar: orden nueva, transferencia pendiente, asesor solicitado, error critico.
