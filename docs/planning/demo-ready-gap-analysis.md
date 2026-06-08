# Gap analysis demo-ready

Ultima actualizacion: 2026-06-07.

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

## Bloqueantes

### 1. Validacion de configurables

Estado actual:

- el dashboard ya permite definir productos compuestos y `product_options`,
- el parser semantico ya puede devolver `optionTexts`,
- pero el backend todavia no valida robustamente que esas opciones existan y cumplan reglas del producto.

Riesgo:

- el bot puede “entender” algo que la operacion real no puede defender bien.

Mejor forma de abordarlo:

1. crear una capa de validacion de opciones separada del router,
2. resolver `groupText` y `valueText` contra `product_options` y `product_option_values`,
3. validar requeridos, `min_select`, `max_select` y valores inactivos,
4. si faltan opciones, preguntar solo por esas,
5. si hay ambiguedad, aclarar o pasar a humano.

Resultado esperado:

- productos simples siguen funcionando igual,
- productos compuestos dejan de ser un punto debil en demo.

### 2. Transferencia end-to-end

Estado actual:

- el restaurante puede aceptar una orden con transferencia,
- el cliente recibe instrucciones,
- si manda comprobante el sistema pasa a `manual`,
- pero no se guarda todavia el archivo real ni cambia formalmente la orden a `payment_pending_review`.

Riesgo:

- la demo se rompe justo en un punto comercial sensible: pago.

Mejor forma de abordarlo:

1. descargar media de Meta cuando llegue imagen/documento,
2. subirla a `payment-proofs`,
3. persistir metadata y relacion con `message` y `order`,
4. mover la orden a `payment_pending_review`,
5. crear alerta humana y dejar la conversacion en `manual`,
6. mostrar el estado de pago pendiente en dashboard.

Resultado esperado:

- la historia de transferencia ya se puede vender como “semiautomatizada con revision humana”.

### 3. Consola humana minima

Estado actual:

- la API de alertas existe,
- el modulo de pedidos existe,
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

- hay typecheck y un E2E valioso,
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

- validador de configurables,
- preguntas de aclaracion por opciones faltantes,
- pruebas unitarias de matcher y opciones.

Impacto:

- elimina el riesgo mas serio del flujo principal.

### Bloque 2: cerrar transferencia

Incluye:

- descarga de media,
- almacenamiento en Supabase Storage,
- estado `payment_pending_review`,
- alerta humana y visualizacion basica.

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

1. Validacion de configurables.
2. Transferencia end-to-end.
3. Bandeja de alertas y timeline humano.
4. Alertas con automatizacion apagada.
5. Pruebas conversacionales y checklist de demo.

## Definicion de terminado demo-ready

Se puede considerar cerrado este tramo cuando:

- el flujo simple funciona con menu real,
- un producto configurable de ejemplo funciona bien,
- transferencia deja evidencia persistida y estado coherente,
- agotados y reemplazos funcionan desde dashboard,
- hay una vista humana minima de alertas/conversacion,
- existe una bateria reproducible de pruebas basicas,
- una prueba manual en WhatsApp staging pasa sin intervencion tecnica ad hoc.
