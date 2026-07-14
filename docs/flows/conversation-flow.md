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
- frase natural simple o compleja.

## Flow B: seleccion de productos

### Interpretacion semantica temporal

La politica vigente es un experimento temporal de routing semantico total: todo mensaje textual procesable llega al parser LLM. No se usa deteccion deterministica de intencion del cliente para adelantar, bloquear o reemplazar esa interpretacion.

Las ramas no textuales o de seguridad siguen antes o fuera del parser: conversacion en `manual`, media/comprobante y ubicacion WhatsApp. Despues del parser, el backend resuelve datos canonicos y valida productos, opciones, precios, cobertura, billing, disponibilidad, transiciones y persistencia.

Cuando agrega item:

1. crea o reutiliza `draft_order`,
2. si el producto tiene configurables requeridos faltantes, entra a `awaiting_product_configuration`,
3. si no faltan configurables, agrega items,
4. recalcula subtotal,
5. deja la conversacion en `awaiting_more_items`,
6. pregunta si desea agregar algo mas o seguir con entrega.

### Camino semantico vigente

1. el router intenta parser semantico con el estado y el ultimo prompt de conversacion,
2. el parser devuelve textos, cantidades, posibles opciones y confianza,
3. el backend intenta resolver eso contra el menu real y contra configurables reales,
4. si un configurable requerido queda incompleto o ambiguo, entra a `awaiting_product_configuration`,
5. si puede aplicar el cambio, actualiza el draft,
6. si no puede, vuelve a aclaracion o handoff; no reinterpreta la intencion con reglas deterministicas amplias.

El LLM no calcula precios, no inventa productos, no decide disponibilidad y no fija el valor final de un configurable.

## Flow B1: aclaracion de configurables

Estado actual implementado:

1. cuando un producto reconocido tiene configurables requeridos faltantes o ambiguos, la conversacion pasa a `awaiting_product_configuration`,
2. el backend pregunta una sola opcion faltante por turno,
3. intenta resolver la respuesta solo contra la opcion pendiente,
4. si completa todas las opciones requeridas, agrega el item al draft con precio final resuelto,
5. si supera el umbral de aclaraciones, deriva a `manual`.

La respuesta se interpreta semanticamente; el valor propuesto se valida contra la opcion pendiente antes de repetir la aclaracion.

## Flow C: checkout

Secuencia actual:

1. `awaiting_more_items`
2. `awaiting_fulfillment_type`
3. `awaiting_address` si es delivery
4. billing: `awaiting_billing_reuse_confirmation`, `awaiting_normal_billing_info` o `awaiting_electronic_billing_info`
5. `awaiting_payment_method`
6. `awaiting_confirmation`
7. crear `order`
8. pasar a `awaiting_restaurant_confirmation`

El backend intenta capturar multiples senales en un mismo mensaje cuando son claras.

Los datos capturados se acumulan en el `draft_order` aunque correspondan a pasos posteriores. Despues de cada actualizacion, el backend pregunta solamente el primer requisito faltante en este orden: productos, fulfillment, ubicacion/cobertura para delivery, facturacion, pago y confirmacion. La ubicacion WhatsApp sigue siendo necesaria para validar cobertura salvo configuracion explicita del tenant.

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

La confirmacion debe mostrar productos, fulfillment (y direccion/costo si es delivery), datos de facturacion, metodo de pago y total.

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

### Estado actual implementado

1. el cliente puede elegir `transferencia`,
2. la orden igual queda `pending_restaurant_confirmation` hasta que el restaurante revise,
3. cuando el restaurante acepta, el cliente recibe instrucciones de pago y la conversacion queda en `awaiting_transfer_proof`,
4. si llega una imagen o documento, el backend descarga el archivo real desde Meta, lo sube a `payment-proofs`, lo enlaza a la orden y mueve la orden a `payment_pending_review`,
5. despues crea alerta operativa y la conversacion pasa a `manual`,
6. el dashboard live puede leer `paymentProof` en el detalle de la orden, descargar el archivo via `GET /dashboard/:tenantSlug/orders/:orderId/payment-proof` y confirmar via `POST /dashboard/:tenantSlug/orders/:orderId/payment-proof/confirm`,
7. la descarga del comprobante se intenta primero con signed URL de Storage y, si esa lectura responde `404`, el backend hace fallback a descarga autenticada server-to-server antes de fallar,
8. si el cliente solo escribe algo como `ya pague` sin adjunto, el bot sigue pidiendo imagen o PDF,
9. si llega audio u otro formato no soportado, el bot pide imagen o PDF y mantiene `awaiting_transfer_proof`.

## Handoff humano

La conversacion pasa a `manual` cuando:

- el usuario pide asesor,
- llega un comprobante de transferencia procesable,
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
awaiting_product_configuration
awaiting_more_items
awaiting_fulfillment_type
awaiting_address
awaiting_billing_reuse_confirmation
awaiting_normal_billing_info
awaiting_electronic_billing_info
awaiting_payment_method
awaiting_transfer_proof
awaiting_transfer_fallback_payment_method
awaiting_confirmation
awaiting_restaurant_confirmation
awaiting_replacement_selection
manual
completed
expired
```

## Politica semantica temporal y validacion de negocio

IA para toda intencion textual:

- pedido libre multi-producto,
- edicion libre del draft,
- opciones y notas expresadas en lenguaje natural,
- frases mixtas y respuestas breves interpretadas contra el estado y ultimo prompt.

Deterministico solo para aplicar y proteger negocio:

- detectar tipo de media/ubicacion y respetar `manual`,
- resolver IDs de producto/opcion y disponibilidad real,
- calcular precio, cobertura y total,
- validar billing, configurables y transiciones permitidas.

El experimento se revisara solo con metricas de precision, coste y latencia, pruebas conversacionales representativas y una decision explicita de producto para reintroducir deteccion deterministica de intencion.

Humano:

- validacion de transferencia,
- rechazo o reenvio de comprobante de transferencia,
- reclamos o casos especiales,
- ambiguedad repetida,
- cambios posteriores a una orden ya confirmada por el restaurante.
