# Handoff humano

## Objetivo

Detener la automatizacion cuando el caso ya no debe seguir por bot y dejar contexto suficiente para que una persona continue.

## Estado actual

Hoy el backend ya puede:

- pasar la conversacion a `manual`,
- guardar `manual_reason`,
- crear `human_intervention_alerts`,
- detener auto-respuestas desde ese momento.

## Casos que hoy disparan handoff

- usuario pide asesor,
- llega comprobante o aviso de pago cuando la conversacion espera transferencia,
- el parser semantico marca `needsHuman`,
- la conversacion supera el limite de aclaraciones,
- falla tecnica en reemplazos u otros caminos operativos.

## Estados y efectos

Cuando se activa handoff:

- `conversations.state = manual`,
- se guarda `manual_reason`,
- se crea una alerta persistente,
- el router deja de responder automaticamente en mensajes posteriores.

## Tipos de alerta operativa

- `support_requested`
- `transfer_payment_review`
- `parser_failed`
- `validation_failed_repeatedly`
- `technical_error`
- `order_change_requested`
- `order_pending_confirmation`

## Gap actual en dashboard

La API ya expone alertas, pero todavia falta una consola humana completa para:

- ver alertas en una bandeja dedicada,
- abrir timeline de conversacion,
- ver mensajes recientes y contexto,
- marcar atendida o resuelta desde UI,
- retomar o reactivar automatizacion con mas control.

## Reactivar automatizacion

Decision de producto:

- solo `encargado` deberia poder reactivar automatizacion.

Estado actual:

- existe toggle general de automatizacion por tenant/sede,
- no existe todavia un flujo visual completo para retomar una conversacion manual especifica.

## Transferencias

Transferencia sigue siendo un caso humano en MVP/demo-ready.

Estado actual:

1. restaurante acepta la orden,
2. el cliente recibe instrucciones de pago,
3. la conversacion queda en `awaiting_transfer_proof`,
4. cuando llega prueba de pago, el backend crea alerta y pasa a `manual`.

Gap actual:

- no se almacena todavia el archivo real del comprobante,
- no se mueve formalmente la orden a `payment_pending_review`,
- no existe UI operativa completa de revision del comprobante.
