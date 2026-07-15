# Handoff humano

## Objetivo

Detener la automatizacion cuando el caso ya no debe seguir por bot y dejar contexto suficiente para que una persona continue.

## Estado actual

Hoy el backend ya puede:

- pasar la conversacion a `manual`,
- guardar `manual_reason`,
- crear `human_intervention_alerts`,
- detener auto-respuestas desde ese momento.

El dashboard permite a `encargado` y `trabajador` pausar o reanudar una conversacion abierta desde la tarjeta o el detalle de pedido. El cambio se ejecuta mediante una RPC transaccional por tenant: bloquea la fila, comprueba la version, guarda/restaura el estado de reanudacion y deja un evento de auditoria.

## Casos que hoy disparan handoff

- usuario pide asesor,
- llega un comprobante real de transferencia y queda pendiente revision,
- llega un comprobante sin orden transferible activa,
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

Cada alerta abierta nueva se notifica una sola vez por ID con sonido, toast y Browser Notification cuando el navegador lo permite. La carga inicial solo establece la linea base; Realtime o polling avisan despues los IDs no vistos.

## Gap actual en dashboard

La API expone alertas, las conversaciones abiertas tienen control basico de pausa/reanudacion y el detalle de pedido permite revisar comprobantes. Todavia falta una consola humana completa para:

- ver alertas en una bandeja dedicada,
- abrir timeline de conversacion,
- ver mensajes recientes y contexto,
- marcar atendida o resuelta desde UI,
- responder y continuar la conversacion manual desde la misma interfaz.

## Reactivar automatizacion

`encargado` y `trabajador` pueden pausar o reactivar automatizacion por conversacion. Al reanudar se resuelven solamente `support_requested`, `parser_failed`, `validation_failed_repeatedly`, `technical_error` y `order_change_requested`; `transfer_payment_review`, `order_pending_confirmation` y `automation_disabled` permanecen abiertas porque requieren una decision operativa propia.

## Transferencias

Transferencia sigue siendo un caso humano en MVP/demo-ready.

Estado actual:

1. restaurante acepta la orden,
2. el cliente recibe instrucciones de pago,
3. la conversacion queda en `awaiting_transfer_proof`,
4. si llega imagen o documento, el backend descarga la media real desde Meta,
5. sube el archivo a `payment-proofs` y crea `payment_proofs`,
6. mueve la orden a `payment_pending_review`,
7. crea alerta `transfer_payment_review` y pasa la conversacion a `manual`,
8. el detalle de pedido ya permite ver el comprobante y confirmar pago.

Gap actual:

- no existe rechazo formal del comprobante con pedido de reenvio,
- no existe bandeja humana dedicada de alertas y conversaciones,
- no existe timeline ni compositor para continuar una conversacion `manual` especifica.
