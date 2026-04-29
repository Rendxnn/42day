# Flujo conversacional

## Tono del bot

Espanol casual, diario, simple y ligeramente amistoso.

Ejemplo actual:

```txt
Hola, soy el asistente de pedidos de Restaurante Demo. Como vas?

Este es el menu de hoy de Restaurante Demo:
1. Menu del dia - $...
2. Sopa del dia - $...

Escribeme que quieres pedir.
```

Evitar:

- frases muy roboticas,
- textos largos,
- lenguaje tecnico,
- promesas que dependan de humano o cocina,
- pedir al usuario que use numeros para decisiones binarias si puede responder natural.

El sistema puede mostrar numeros como referencia de productos del menu, pero no debe depender de numeros para entender fulfillment, pago o confirmacion.

## Entrada inicial

Cuando llega un mensaje nuevo y no hay conversacion activa:

1. resolver tenant,
2. crear o encontrar customer por telefono,
3. crear conversacion,
4. cargar menu del dia,
5. responder saludo + menu disponible + una pregunta abierta corta.

El usuario debe poder escribir:

```txt
2 menu del dia con sopa de frijoles
quiero dos almuerzos a domicilio
uno para recoger y pago en efectivo
asesor
```

## Flow A: pedido guiado deterministico

1. Usuario saluda, pide menu o escribe un producto.
2. Bot muestra items del menu del dia si aun no los mostro.
3. Usuario selecciona item.
4. Bot pide variantes obligatorias si el producto es configurable.
5. Bot infiere cantidad o pregunta cantidad si falta.
6. Bot permite agregar mas items o continuar.
7. Bot pregunta si es domicilio o pickup con lenguaje natural.
8. Si es domicilio, bot pide direccion o ubicacion.
9. Bot pide metodo de pago con pregunta natural.
10. Bot calcula total.
11. Bot muestra resumen.
12. Usuario confirma con texto o boton.
13. Backend crea `order`.
14. Bot confirma recepcion.

## Flow B: pedido libre con fallback LLM

1. Usuario escribe pedido natural.
2. Backend carga menu activo.
3. Backend primero corre normalizador, detector y matcher deterministico.
4. Si el pedido tiene configurables, multiples entidades o texto ambiguo que el matcher no resuelve con confianza, llama parser semantico.
5. Parser devuelve candidato estructurado sin precios ni decisiones finales.
6. Validacion deterministica revisa candidato.
7. Si faltan datos, bot pregunta solo por lo faltante.
8. Si hay ambiguedad, bot pide aclaracion corta.
9. Si esta listo, pricing calcula total.
10. Bot muestra resumen.
11. Usuario confirma.
12. Backend crea `order`.

El LLM no calcula precios, no inventa productos y no decide disponibilidad.

## Flow C: ver menu

1. Usuario pide menu.
2. Bot muestra menu del dia en texto corto.
3. Bot pregunta que quiere pedir.

No debe obligar a elegir entre modos. El usuario puede pedir por numero, por nombre o con frase natural.

## Flow D: transferencia

1. Usuario elige transferencia, incluso con typos como `trasnferencia`.
2. Bot muestra datos de transferencia configurados por tenant.
3. Bot indica que envie comprobante cuando pague.
4. Cuando llega imagen/documento/texto de pago:
   - registrar mensaje,
   - almacenar comprobante si hay archivo,
   - crear o mantener orden en `payment_pending_review`,
   - crear alerta humana,
   - poner conversacion en `manual`.
5. Restaurante verifica y continua manualmente desde dashboard.

Decision MVP: la transferencia no se valida automaticamente.

## Confirmacion

Se soportan dos vias:

- botones interactivos: `Confirmar`, `Cambiar`, `Cancelar`.
- texto libre: `si`, `confirmo`, `listo`, `no`, `cancelar`.

Tambien debe aceptar frases naturales:

```txt
si, esta bien
dale
confirmado
mejor cambiemos la direccion
no, asi no
```

La orden final solo se crea si:

- draft esta valido,
- total fue calculado por backend,
- usuario confirmo,
- tenant/sede sigue activo.

## Timeout de 30 minutos

Si el usuario no responde durante 30 minutos:

1. conversacion pasa a `expired`,
2. draft pasa a `expired`,
3. bot puede enviar un cierre simple si el sistema tiene permiso operativo:

```txt
Cerramos este pedido porque paso un rato sin respuesta. Cuando quieras, escribenos de nuevo y arrancamos otro.
```

Si el usuario escribe despues:

- se crea una nueva conversacion,
- no se reutiliza el draft expirado,
- se puede usar historial solo como referencia, no como pedido activo.

## Reglas de cambio de estado

Estados principales:

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
manual
completed
expired
```

Reglas:

- `manual` detiene auto-respuestas y debe mantener contexto visible para dashboard.
- `completed` no acepta cambios al pedido; cambios posteriores son nueva conversacion o manejo humano.
- `expired` no se reactiva.
- si no hay menu activo, ir a handoff o responder que el restaurante aun no publico menu.

## Balance deterministico vs LLM

Deterministico:

- saludo,
- pedir menu,
- asesor/humano,
- payment method,
- delivery/pickup,
- confirmacion/cancelacion,
- ubicacion WhatsApp,
- comprobante por tipo de mensaje,
- cantidades simples,
- producto por numero o alias.

LLM:

- pedido libre con varios productos,
- opciones configurables expresadas en lenguaje natural,
- notas del pedido,
- direccion con ruido,
- texto que queda en zona gris despues del matcher deterministico.

Humano:

- transferencia pendiente de validar,
- solicitud explicita de asesor,
- ambiguedad despues de 2 aclaraciones,
- reclamos o condiciones especiales no soportadas,
- cambios sobre orden ya confirmada.
