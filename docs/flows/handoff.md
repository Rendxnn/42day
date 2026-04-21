# Handoff humano

## Objetivo

Permitir que el sistema deje de responder automaticamente cuando el caso necesita una persona.

## Casos que activan handoff

- usuario pide hablar con asesor,
- usuario envia comprobante de transferencia,
- usuario envia reclamo o mensaje fuera del flujo,
- pedido ambiguo despues de varios intentos,
- error tecnico que impide continuar,
- restaurante desactiva automatizacion,
- pedido con condiciones especiales no soportadas por MVP,
- cliente pide modificar una orden ya confirmada.

## Estados

Cuando se activa handoff:

- `conversations.state = manual`,
- se crea `human_intervention_alert`,
- se guarda razon,
- se detienen respuestas automaticas.

## Tipos de alerta

- `support_requested`
- `transfer_payment_review`
- `parser_failed`
- `validation_failed_repeatedly`
- `technical_error`
- `order_change_requested`
- `automation_disabled`

## UX esperada en dashboard

El dashboard debe mostrar:

- cliente,
- telefono,
- ultima conversacion,
- razon de alerta,
- pedido/draft relacionado,
- mensajes recientes,
- boton para marcar como atendida,
- boton para reactivar automatizacion si aplica.

## Reactivar automatizacion

Solo un usuario con rol `encargado` deberia poder reactivar automatizacion para una conversacion manual.

Cuando se reactiva:

- se registra evento,
- se define el nuevo estado,
- normalmente se envia un mensaje corto al cliente.

## Transferencias

Transferencia siempre requiere verificacion humana en MVP.

Flujo sugerido:

1. bot muestra datos de pago,
2. cliente envia comprobante,
3. sistema crea alerta `transfer_payment_review`,
4. conversacion pasa a `manual`,
5. encargado/trabajador revisa,
6. si pago valido, marca orden como `accepted` o continua proceso,
7. si pago no valido, responde manualmente o pide nuevo comprobante.

