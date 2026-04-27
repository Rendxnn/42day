# Plan del motor determinista de pedidos

Ultima actualizacion: 2026-04-27.

## Objetivo

Construir un flujo de WhatsApp que se sienta fluido y natural resolviendo por reglas la mayor cantidad posible de mensajes, usando LLM solo como fallback.

## Principio rector

- primero deterministico,
- luego aclaracion,
- luego humano o LLM segun el caso.

El LLM no debe ser el camino principal para:

- saludo,
- mostrar menu,
- detectar productos del menu activo,
- cantidades,
- delivery/pickup,
- direccion/ubicacion,
- pago,
- confirmacion final.

## Alcance del motor determinista V1

Debe resolver bien:

1. saludo
2. mostrar menu de hoy
3. seleccionar producto por numero
4. seleccionar producto por alias
5. detectar cantidad numerica o en palabras
6. detectar delivery/pickup
7. aceptar ubicacion WhatsApp
8. aceptar direccion de texto
9. detectar metodo de pago
10. detectar confirmacion o rechazo
11. detectar pedido de humano
12. manejar hasta 2 aclaraciones

## Flujo objetivo V1

Ejemplo deseado:

```txt
usuario: Hola buenas
restaurante: ¡Hola! ¿Como estas?
Para hoy tenemos:
[MENU]

Puedo enviarte la carta o puedes revisar el perfil de WhatsApp para mas opciones.

¿Como puedo ayudarte?

usuario: 2 menu del dia por favor
restaurante: Te confirmo:
2 menu del dia
Subtotal: XXXX

¿Domicilio o para recoger en la tienda?

usuario: domicilio
restaurante: Listo. Enviame tu ubicacion o escribeme la direccion.

usuario: [ubicacion]
restaurante: Excelente.
¿Como prefieres pagar?
1. Efectivo
2. Transferencia

usuario: efectivo
restaurante: Te confirmo:
2 menu del dia [precio]
domicilio [precio]
tiempo estimado [30 min]
total [total]

Confirmame si todo esta correcto para registrar tu pedido.
```

## Arquitectura del motor

## Capa 1. Normalizacion

Cada mensaje debe pasar por:

- lower-case,
- quitar tildes,
- colapsar espacios,
- remover ruido comun,
- normalizar variantes frecuentes.

Ejemplos:

- `menú` -> `menu`
- `pa recoger` -> `pickup`
- `domi` -> `domicilio`

## Capa 2. Deteccion de senales

No se debe intentar una sola intencion global.
Se detectan senales por prioridad:

1. humano / asesor
2. ubicacion
3. comprobante
4. confirmacion si/no
5. pago
6. fulfillment
7. seleccion producto/cantidad
8. saludo
9. pedir menu
10. fallback

## Capa 3. Extraccion de entidades

El motor debe extraer:

- `quantity`
- `product_candidate`
- `option_candidates`
- `fulfillment_type`
- `payment_method`
- `confirmation`
- `schedule_time`
- `address_text`
- `location`

## Capa 4. Matching conservador

### Regla general

Se compara contra:

- `menu_items` activos del menu publicado,
- aliases de productos,
- aliases de opciones configurables.

### Umbral recomendado inicial

- `1.00`: alias exacto
- `>= 0.90`: aceptar directo
- `0.75 - 0.89`: aceptar solo si no hay competidor cercano y el estado ayuda
- `< 0.75`: aclarar

### Regla de empate

Si la diferencia entre el mejor y el segundo mejor match es menor a `0.10`, aclarar.

Esto deja el matcher ajustable sin reescribir la logica.

## Capa 5. State machine

La interpretacion depende del estado actual de la conversacion:

- `awaiting_mode_selection`
- `awaiting_guided_item_selection`
- `awaiting_fulfillment_type`
- `awaiting_address`
- `awaiting_payment_method`
- `awaiting_transfer_proof`
- `awaiting_confirmation`
- `manual`
- `completed`

Y de:

- `conversations.context`
- `conversations.clarification_attempts`

## Productos configurables y "arma tu plato"

Decision:

- se soportaran productos fijos y configurables,
- el menu del dia puede ser una opcion cerrada o un producto configurable,
- tambien puede haber varios productos configurables distintos.

## Estrategia de modelado

Se usara una extension de `product_options`.

### Producto fijo

- se detecta el producto,
- opcionalmente cantidad,
- sin seleccionar componentes.

### Producto configurable

Ejemplo:

`almuerzo con pollo a la plancha, sopa de frijoles y jugo de maracuya`

Se resuelve si el dashboard configura:

- producto principal: `almuerzo del dia`
- grupos:
  - proteina
  - sopa
  - bebida
- opciones por grupo
- aliases por opcion
- si el grupo es requerido u opcional
- min/max seleccion

### Implicacion

El matching de opciones no se hace contra todo el catalogo.
Se hace dentro del grupo del producto configurable.

Eso hace viable el enfoque determinista.

## Configuracion de aliases

Decision:

- los aliases se administran desde dashboard.

Se recomienda soportar:

- aliases de productos
- aliases de opciones de productos configurables

## Cantidades

Decision:

- soportar cantidades numericas y en palabras desde V1.

Ejemplos:

- `2`
- `x2`
- `2x`
- `dos`
- `tres`
- `una`

## Tiempo estimado

Decision actual:

- dejarlo fijo por defecto en `30 min`,
- luego parametrizarlo por tenant/dashboard en una version mas avanzada.

Marcado como pendiente de producto avanzado:

- tiempo por fulfillment
- franjas horarias
- carga operativa real

## Resumen final

Decision:

Siempre incluir en el resumen final:

- items
- subtotal
- domicilio si aplica
- total
- tiempo estimado
- metodo de pago

## Multiples entidades en un solo mensaje

Decision:

El motor debe soportar mensajes como:

- `quiero 2 menu del dia a domicilio`
- `uno para recoger y pago en efectivo`

La politica recomendada:

- capturar todo lo que este claro,
- solo preguntar por lo que falte.

## Politica de aclaracion

Decision:

- maximo 2 intentos de aclaracion automatica,
- luego pasar a humano.

## Fallback a LLM

Por ahora solo para:

1. `semantic_order_parse`
2. `menu_ingestion`

No usar LLM como camino principal del pedido guiado.

## Orden recomendado de implementacion

1. `message_normalizer`
2. `intent_detector`
3. `entity_extractors`
4. `catalog_matcher`
5. `slot_filling_policy`
6. `response_composer`
7. soporte para productos configurables
8. fallback a LLM

## Pendientes antes de codificar

Queda por aterrizar en datos y dashboard:

1. estructura exacta de extension de `product_options`
2. UI/dashboard para aliases
3. UI/dashboard para grupos y opciones configurables
4. si el producto configurable soporta extras pagados desde V1 o luego

## Resultado esperado

Tener un flujo de WhatsApp que parezca natural en el 70%-90% de los casos operativos comunes del MVP sin depender del LLM.
