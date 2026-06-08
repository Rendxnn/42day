# Flujo conversacional

## Tono del bot

Espanol casual, diario, simple y ligeramente amistoso.

Debe evitar:

- frases roboticas,
- parrafos largos,
- lenguaje tecnico,
- prometer preparacion antes de que el restaurante confirme,
- obligar al usuario a contestar solo con numeros.

## Punto de entrada

Cuando llega un mensaje nuevo:

1. se resuelve tenant,
2. se crea o reutiliza customer,
3. se crea o reutiliza conversacion activa,
4. se registra el inbound,
5. se enruta segun estado actual y senales del mensaje.

## Flow A: saludo o menu

Estado actual implementado:

1. si no hay pedido activo, el bot carga el menu publicado del dia,
2. responde con saludo + menu + pregunta abierta,
3. deja la conversacion en `awaiting_guided_item_selection`.

El usuario puede seguir por:

- numero del producto,
- nombre,
- alias,
- frase natural simple,
- pedido mas libre si el parser semantico ayuda.

## Flow B: seleccion de productos

### Camino deterministico

Resuelve hoy:

- seleccion numerica,
- match por texto o alias,
- cantidades simples,
- frases multi-item simples separadas por `y`, `ademas`, `tambien` o coma.

Cuando agrega item:

1. crea o reutiliza `draft_order`,
2. agrega items,
3. recalcula subtotal,
4. deja la conversacion en `awaiting_more_items`,
5. pregunta si desea agregar algo mas o seguir con entrega.

### Camino con IA

Si el mensaje parece pedido libre o edicion libre:

1. el router intenta parser semantico,
2. el parser devuelve textos, cantidades, posibles opciones y confianza,
3. el backend intenta resolver eso contra el menu real,
4. si puede aplicar el cambio, actualiza el draft,
5. si no puede, vuelve a aclaracion o camino deterministico.

El LLM no calcula precios, no inventa productos y no decide disponibilidad.

## Flow C: checkout

Secuencia actual:

1. `awaiting_more_items`
2. `awaiting_fulfillment_type`
3. `awaiting_address` si es delivery
4. `awaiting_payment_method`
5. `awaiting_confirmation`
6. crear `order`
7. pasar a `awaiting_restaurant_confirmation`

El backend intenta capturar multiples senales en un mismo mensaje cuando son claras.

Ejemplos que debe tolerar:

```txt
quiero otro jugo y seguimos
pickup y pago en efectivo
domicilio, te mando ubicacion
si, esta bien
```

## Flow D: confirmacion del cliente

Se soporta por texto libre.

Confirmacion positiva:

- `si`
- `dale`
- `confirmo`
- `listo`
- `ok`

Cambio o rechazo:

- `no`
- `cancelar`
- `cambiemos`
- `quita uno`
- `agrega otra bebida`

Cuando el cliente confirma:

1. el backend valida que el draft tenga lo minimo,
2. crea `orders` y `order_items`,
3. crea alerta operativa de confirmacion,
4. deja la conversacion en `awaiting_restaurant_confirmation`,
5. informa que el restaurante revisa el pedido.

## Flow E: confirmacion del restaurante

Estado actual implementado:

1. el dashboard lista pedidos pendientes,
2. el restaurante puede aceptar,
3. o reportar agotado desde el detalle.

Si acepta:

- la orden pasa a `accepted`,
- si el pago es efectivo, la conversacion pasa a `completed`,
- si el pago es transferencia, la conversacion pasa a `awaiting_transfer_proof`,
- el backend notifica al cliente por WhatsApp.

## Flow F: agotados y reemplazos

Estado actual implementado:

1. el restaurante marca un item agotado,
2. selecciona alternativas activas,
3. la orden pasa a `needs_customer_replacement`,
4. la conversacion pasa a `awaiting_replacement_selection`,
5. el cliente puede responder con numero, nombre claro o `cancelar`.

Si el cliente elige reemplazo:

- se actualizan `order_items` y draft relacionado,
- se recalculan totales,
- la orden vuelve a `pending_restaurant_confirmation`,
- la conversacion vuelve a `awaiting_restaurant_confirmation`.

Si cancela:

- la orden queda `cancelled`,
- el draft queda `cancelled`,
- la conversacion queda `completed`.

## Flow G: transferencia

### Estado actual

1. el cliente puede elegir `transferencia`,
2. la orden igual queda `pending_restaurant_confirmation` hasta que el restaurante revise,
3. cuando el restaurante acepta, el cliente recibe instrucciones de pago y la conversacion queda en `awaiting_transfer_proof`,
4. si llega imagen, documento o texto de comprobante, el flujo pasa a `manual` y crea alerta.

### Gap actual

Todavia falta:

- descargar y almacenar el archivo real,
- asociarlo a mensaje y orden,
- mover formalmente la orden a `payment_pending_review`.

## Handoff humano

La conversacion pasa a `manual` cuando:

- el usuario pide asesor,
- llega comprobante de transferencia,
- hay ambiguedad repetida,
- hay error tecnico,
- el caso operativo ya no debe seguir automatico.

## Timeout

Si pasan 30 minutos sin respuesta:

- la conversacion expira,
- el draft activo expira,
- un mensaje posterior abre una nueva conversacion.

## Estados de conversacion

```txt
new
awaiting_mode_selection
awaiting_guided_item_selection
awaiting_more_items
awaiting_fulfillment_type
awaiting_address
awaiting_payment_method
awaiting_transfer_proof
awaiting_confirmation
awaiting_restaurant_confirmation
awaiting_replacement_selection
manual
completed
expired
```

## Balance deterministico vs IA

Deterministico:

- saludo,
- menu,
- fulfillment,
- pago,
- confirmacion,
- ubicacion,
- comprobante por tipo de mensaje,
- cantidades simples,
- producto por numero o alias.

IA:

- pedido libre multi-producto,
- edicion libre del draft,
- opciones y notas expresadas en lenguaje natural,
- frases mixtas donde el deterministico no alcanza.

Humano:

- validacion de transferencia,
- reclamos o casos especiales,
- ambiguedad repetida,
- cambios posteriores a una orden ya confirmada por el restaurante.
