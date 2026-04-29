# Plan del motor determinista de pedidos

Ultima actualizacion: 2026-04-29.

## Objetivo

Construir un flujo de WhatsApp que se sienta fluido y natural resolviendo por reglas la mayor cantidad posible de mensajes, usando LLM solo como parser acotado cuando el mensaje natural supera lo que el matcher deterministico puede resolver con confianza.

## Principio rector

- primero deterministico para senales cerradas,
- LLM acotado para extraer estructura de pedidos libres o configurables,
- validacion deterministica siempre despues del LLM,
- aclaracion corta cuando falten datos o haya ambiguedad,
- humano cuando el caso sea operativo, sensible o repetidamente ambiguo.

El LLM no debe decidir:

- precios,
- disponibilidad,
- total,
- confirmacion final,
- estado final de la orden,
- handoff operativo,
- si el restaurante acepta o no el pedido.

El LLM si puede ayudar a extraer:

- producto mencionado en lenguaje natural,
- opciones de un producto configurable,
- notas del pedido,
- cantidad cuando viene mezclada en una frase,
- direccion textual cuando viene con ruido,
- intencion general cuando el deterministico no alcanza confianza.

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
13. capturar multiples senales claras en un mismo mensaje

## Flujo objetivo V1

Ejemplo deseado:

```txt
usuario: Hola buenas
restaurante: Hola, como vas?
Hoy tenemos:
1. Menu del dia - $...
2. Sopa del dia - $...

Escribeme que quieres pedir.

usuario: 2 menu del dia por favor
restaurante: Te confirmo:
2 menu del dia
Subtotal: XXXX

Lo quieres a domicilio o para recoger?

usuario: domicilio
restaurante: Listo, va a domicilio. Enviame tu ubicacion o escribeme la direccion.

usuario: [ubicacion]
restaurante: Excelente. Pagas en efectivo o por transferencia?

usuario: efectivo
restaurante: Te confirmo:
2 menu del dia [precio]
domicilio [precio]
tiempo estimado [30 min]
total [total]

Confirmame si todo esta correcto para registrar tu pedido.
```

Ejemplo objetivo con configurables:

```txt
usuario: quiero 2 menu del dia con sopa de frijoles y jugo de mora
restaurante: Listo. Te llevo 2 menu del dia con sopa de frijoles y jugo de mora.
Los quieres a domicilio o para recoger?
```

## Arquitectura del motor

## Capa 1. Normalizacion

Cada mensaje debe pasar por:

- lower-case,
- quitar tildes,
- colapsar espacios,
- remover ruido comun,
- normalizar variantes frecuentes,
- conservar texto original para logs y LLM.

Ejemplos:

- `menu` -> `menu`
- `pa recoger` -> `pickup`
- `domi` -> `domicilio`
- `trasnferencia` -> `transferencia`

## Capa 2. Deteccion de senales

No se debe intentar una sola intencion global.
Se detectan senales por prioridad:

1. humano / asesor
2. ubicacion
3. comprobante
4. confirmacion si/no/cambio
5. pago
6. fulfillment
7. seleccion producto/cantidad
8. saludo
9. pedir menu
10. fallback

Para senales cerradas se debe soportar typo/fuzzy matching conservador:

- `trasnferencia`, `transfe`, `nequi`, `daviplata` -> transferencia
- `efectvo`, `efectibo`, `cash` -> efectivo
- `domi`, `domicilo`, `envio` -> domicilio
- `recoger`, `retiro`, `paso por el`, `tienda` -> pickup
- `sii`, `sip`, `dale`, `listo`, `confirmado` -> confirmacion positiva

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
- `notes`

La politica recomendada:

- capturar todo lo claro,
- no repreguntar datos ya capturados,
- preguntar solo por el siguiente dato faltante.

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
- `< 0.75`: aclarar o llamar LLM si el mensaje contiene pedido libre

### Regla de empate

Si la diferencia entre el mejor y el segundo mejor match es menor a `0.10`, aclarar.

Esto deja el matcher ajustable sin reescribir la logica.

## Capa 5. State machine

La interpretacion depende del estado actual de la conversacion:

- `awaiting_mode_selection`
- `awaiting_guided_item_selection`
- `awaiting_more_items`
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

## Capa 6. Response composer

La redaccion no debe vivir mezclada con la decision del router.

El `response_composer` debe recibir un resultado estructurado y producir texto:

- una pregunta por mensaje,
- maximo 4-6 lineas salvo menu/resumen,
- sin listas numeradas para delivery/pickup o pago,
- con variacion controlada por estado,
- con productos y totales reales,
- sin promesas operativas que dependan de cocina.

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

```txt
almuerzo con pollo a la plancha, sopa de frijoles y jugo de maracuya
```

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

Eso hace viable el enfoque deterministico.

## Configuracion de aliases

Decision:

- los aliases se guardan inicialmente en BD.
- mas adelante se administran desde dashboard.

Se recomienda soportar:

- aliases de productos
- aliases de opciones de productos configurables
- aliases de fulfillment/pago como diccionario de sistema

Los aliases reducen ambiguedad y llamadas LLM. Son la fuente que permite aceptar frases como `corrientazo`, `menu`, `sopita de frijol`, `nequi` o `trasnferencia` sin pedirle al usuario que escriba exactamente el nombre del catalogo.

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
- `dos menus con sopa de frijoles para domicilio y pago por nequi`

La politica recomendada:

- capturar todo lo que este claro,
- solo preguntar por lo que falte.

## Politica de aclaracion

Decision:

- maximo 2 intentos de aclaracion automatica,
- luego pasar a humano.

Aclaraciones buenas:

```txt
Te entiendo. La sopa la quieres de frijoles o de verduras?
```

Aclaraciones malas:

```txt
No entendi. Escribe 1, 2 o 3.
```

## Fallback a LLM

Usar LLM solo para tareas de extraccion, no para decidir el flujo.

Tareas iniciales:

1. `semantic_order_parse`
2. `menu_ingestion`

`semantic_order_parse` debe activarse cuando:

- el mensaje menciona producto + opciones configurables y el matcher deterministico no logra resolver todas las opciones,
- hay varias entidades en una frase y el estado actual permite capturarlas,
- el usuario escribe un pedido libre completo,
- el texto contiene notas o restricciones que conviene preservar,
- hay typo o sinonimo de producto que no existe en aliases y el score queda en zona gris.

No debe activarse cuando:

- el estado espera pago y el texto se parece a efectivo/transferencia,
- el estado espera delivery/pickup y el texto se parece a fulfillment,
- el usuario confirma o cancela,
- el usuario pide asesor,
- llega una ubicacion WhatsApp,
- el texto es un saludo o pide menu,
- hay que validar precio, stock o disponibilidad.

Todo resultado del LLM debe pasar por:

1. schema estricto,
2. validacion contra menu activo,
3. matching conservador de productos/opciones,
4. pricing backend,
5. resumen y confirmacion del usuario.

## Orden recomendado de implementacion

1. `message_normalizer`
2. `signal_detector`
3. `entity_extractors`
4. `catalog_matcher`
5. `slot_filling_policy`
6. `response_composer`
7. soporte para productos configurables
8. configuracion LLM por tenant con Gemini
9. fallback LLM con `semantic_order_parse`
10. correccion de conversaciones `manual`
11. tests de mensajes conversacionales

## Pendientes antes de codificar configurables

Queda por aterrizar en datos y dashboard:

1. UI/dashboard para aliases
2. UI/dashboard para grupos y opciones configurables
3. si el producto configurable soporta extras pagados desde V1 o luego

## Resultado esperado

Tener un flujo de WhatsApp que parezca natural en el 80% de los casos operativos comunes del MVP sin depender del LLM para senales cerradas.
