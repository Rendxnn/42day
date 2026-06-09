# Gap analysis demo-ready

Ultima actualizacion: 2026-06-08.

## Objetivo

Identificar el tramo minimo y de mayor impacto para dejar 42day listo para:

- grabar demos,
- hacer pruebas guiadas con posibles clientes,
- mostrar un flujo principal coherente de punta a punta.

No es un plan de produccion completa. Es un plan de cierre funcional y operativo para demo.

## Criterio de demo-ready

Consideramos `demo-ready` cuando un restaurante puede ver y entender este ciclo sin hacks visibles:

```txt
cliente escribe
-> bot responde con menu real o entiende pedido simple
-> pedido se arma bien
-> cliente confirma
-> restaurante revisa en dashboard
-> acepta o devuelve por agotado
-> cliente recibe seguimiento
```

## Cerrado en codigo

### 1. Validacion de configurables

Estado actual:

- el menu conversacional ya carga configurables reales,
- el backend ya resuelve `groupText` y `valueText` contra `product_options` y `product_option_values`,
- ya valida requeridos, ambiguedades, valores inactivos y `priceDelta`,
- ya existe `awaiting_product_configuration` para pedir solo la opcion faltante.

Impacto:

- productos compuestos ya no dependen de texto opaco en el draft,
- el resumen y el precio final ya salen de una resolucion estructurada,
- la confirmacion del pedido se bloquea si queda configuracion pendiente.

### 2. Transferencia end-to-end

Estado actual:

- cuando llega imagen o documento en `awaiting_transfer_proof`, el backend descarga media de Meta,
- sube el archivo real a `payment-proofs`,
- persiste `payment_proofs`,
- enlaza el comprobante con mensaje y orden,
- mueve la orden a `payment_pending_review`,
- deja revision minima en el detalle del pedido para ver comprobante y confirmar pago.

Impacto:

- el flujo de transferencia ya es demostrable sin hacks manuales,
- el restaurante ya puede cerrar la historia minima de pago desde dashboard.

## Pendientes criticos

### 3. Consola humana minima

Estado actual:

- la API de alertas existe,
- el modulo de pedidos existe,
- el detalle de pedido ya muestra comprobante de transferencia y confirmacion minima de pago,
- pero no hay bandeja visual clara de alertas ni timeline de conversacion.

Riesgo:

- el producto parece fuerte en automatizacion, pero flojo cuando toca intervenir.

Mejor forma de abordarlo:

1. crear vista `Alertas` en dashboard,
2. listar alertas abiertas y acknowledged,
3. mostrar order, conversation y razon,
4. permitir acknowledge/resolve,
5. agregar endpoint de mensajes por conversacion si hace falta,
6. mostrar timeline corto de mensajes en el detalle.

Resultado esperado:

- ya se puede contar una historia completa de “bot + operacion humana”.

## Importantes

### 4. Alertas cuando automatizacion esta apagada

Estado actual:

- el sistema deja de responder,
- pero no deja una cola clara de trabajo pendiente por cada mensaje.

Mejor forma de abordarlo:

1. al detectar `automation_enabled = false`, registrar alerta por mensaje nuevo o por conversacion,
2. evitar duplicados agresivos,
3. mostrarlo en bandeja de alertas.

### 5. Pruebas conversacionales

Estado actual:

- hay typecheck, pruebas unitarias utiles y un E2E valioso,
- no hay cobertura fuerte de escenarios naturales ni configurables.

Mejor forma de abordarlo:

1. extraer matcher y validadores a funciones testeables,
2. cubrir casos por tabla:
   - saludo,
   - pedido guiado,
   - pedido natural,
   - cambio de draft,
   - configurables,
   - transferencia,
   - agotado,
   - handoff.

### 6. Documentar y mostrar limites reales en demo

Estado actual:

- ya hay features suficientes,
- pero si la demo no marca bien los limites, se puede sobreprometer.

Mejor forma de abordarlo:

- usar demos con menu curado,
- usar productos compuestos que ya pasen por el nuevo validador,
- evitar mostrar escenarios no cerrados,
- explicar que transferencia y handoff son supervisados.

## Nice to have

### 7. Mejor explotacion de campos semanticos

- usar `addressText` cuando la direccion venga ruidosa,
- usar mejor `confirmationText`,
- parametrizar umbral de confianza del parser.

### 8. Observabilidad mas limpia

- eventos por intento LLM,
- conteo de aclaraciones,
- motivos de fallback visibles por mensaje.

## Breakdown recomendado

### Bloque 1: cerrar core de pedido

Incluye:

- implementado.

Impacto:

- elimina el riesgo mas serio del flujo principal.

### Bloque 2: cerrar transferencia

Incluye:

- implementado.

Impacto:

- cierra un camino comercial muy comun.

### Bloque 3: cerrar operacion humana

Incluye:

- vista de alertas,
- timeline minimo de mensajes,
- acciones acknowledge/resolve,
- mejor contexto para `manual`.

Impacto:

- convierte el dashboard en consola creible de restaurante.

### Bloque 4: endurecer pruebas y demo scripts

Incluye:

- tests conversacionales,
- ampliar E2E,
- checklist de prueba manual en staging con telefono real.

Impacto:

- reduce sorpresas al mostrar el producto.

## Orden recomendado

1. Bandeja de alertas y timeline humano.
2. Alertas con automatizacion apagada.
3. Pruebas conversacionales y checklist de demo.

## Definicion de terminado demo-ready

Se puede considerar cerrado este tramo cuando:

- el flujo simple funciona con menu real,
- un producto configurable de ejemplo funciona bien,
- transferencia deja evidencia persistida y estado coherente,
- agotados y reemplazos funcionan desde dashboard,
- hay una vista humana minima de alertas/conversacion,
- existe una bateria reproducible de pruebas basicas,
- una prueba manual en WhatsApp staging pasa sin intervencion tecnica ad hoc.
