# Flujo conversacional

## Tono del bot

Espanol casual, diario, simple y ligeramente amistoso.

Ejemplo:

```txt
Hola, te ayudo con tu pedido. Puedes ver el menu, hacer pedido guiado, escribirlo como quieras o hablar con alguien del restaurante.
```

Evitar:

- frases muy roboticas,
- textos largos,
- lenguaje tecnico,
- promesas que dependan de humano o cocina.

## Entrada inicial

Cuando llega un mensaje nuevo y no hay conversacion activa:

1. resolver tenant,
2. crear o encontrar customer por telefono,
3. crear conversacion,
4. cargar menu del dia,
5. responder opciones:
   - ver menu,
   - hacer pedido guiado,
   - escribir pedido libre,
   - hablar con asesor.

## Flow A: pedido guiado

1. Usuario elige `hacer pedido guiado`.
2. Bot muestra categorias o items del menu del dia.
3. Usuario selecciona item.
4. Bot pide variantes obligatorias.
5. Bot pregunta cantidad.
6. Bot permite agregar mas items o continuar.
7. Bot pregunta si es domicilio o pickup.
8. Si es domicilio, bot pide direccion.
9. Bot pide metodo de pago.
10. Bot calcula total.
11. Bot muestra resumen.
12. Usuario confirma con boton o texto.
13. Backend crea `order` en `pending_restaurant_confirmation`.
14. Bot informa que el restaurante revisa el pedido.
15. Restaurante acepta o devuelve por agotado desde dashboard.
16. Backend notifica al cliente por WhatsApp.

## Flow B: pedido libre

1. Usuario escribe pedido natural.
2. Backend carga menu activo.
3. Backend llama parser semantico.
4. Parser devuelve candidato estructurado.
5. Validacion deterministica revisa candidato.
6. Si faltan datos, bot pregunta.
7. Si hay ambiguedad, bot pide aclaracion.
8. Si esta listo, pricing calcula total.
9. Bot muestra resumen.
10. Usuario confirma.
11. Backend crea `order` en `pending_restaurant_confirmation`.
12. Bot informa que el restaurante revisa el pedido.
13. Restaurante acepta o devuelve por agotado desde dashboard.
14. Backend notifica al cliente por WhatsApp.

## Flow C: ver menu

1. Usuario elige `ver menu`.
2. Bot muestra menu del dia en texto corto o lista.
3. Bot pregunta si desea:
   - pedir guiado,
   - escribir pedido libre,
   - hablar con asesor.

## Flow D: transferencia

1. Usuario elige transferencia.
2. El pedido queda pendiente de confirmacion del restaurante despues de que el cliente confirma el resumen.
3. Cuando el restaurante acepta disponibilidad, el bot muestra datos de transferencia configurados por tenant.
4. Bot indica que envie comprobante o escriba cuando haya pagado.
5. Cuando llega imagen/documento/texto de pago:
   - registrar mensaje,
   - almacenar comprobante si hay archivo,
   - crear o mantener orden en `payment_pending_review`,
   - crear alerta humana,
   - poner conversacion en `manual`.
6. Restaurante verifica y continua manualmente desde dashboard.

Decision MVP: la transferencia no se valida automaticamente.

## Confirmacion

Se soportan dos vias:

- botones interactivos: `Confirmar`, `Cambiar`, `Cancelar`.
- texto libre: `si`, `confirmo`, `listo`, `no`, `cancelar`.

La orden final solo se crea si:

- draft esta valido,
- total fue calculado por backend,
- usuario confirmo,
- tenant/sede sigue activo.

Despues de la confirmacion del cliente, la orden queda pendiente de confirmacion del restaurante. El bot no promete preparacion hasta que el restaurante acepte la orden desde dashboard.

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

Reglas:

- `manual` detiene auto-respuestas.
- `awaiting_restaurant_confirmation` evita crear otro pedido mientras el restaurante revisa.
- `awaiting_replacement_selection` espera que el cliente elija reemplazo o cancele cuando hubo agotado.
- `completed` no acepta cambios al pedido; cambios posteriores son nueva conversacion o manejo humano.
- `expired` no se reactiva.
- si no hay menu activo, ir a handoff o responder que el restaurante aun no publico menu.
