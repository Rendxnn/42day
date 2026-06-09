# Conversacion natural e integracion IA

Ultima actualizacion: 2026-06-07.

## Objetivo

Mantener un bot que se sienta natural sin perder control operativo:

- deterministico para senales cerradas,
- LLM solo para extraer estructura cuando aporta valor,
- validacion backend siempre,
- humano cuando el caso deja de ser seguro para automatizar.

## Como interactua hoy la IA con el flujo

### 1. El camino por defecto es deterministico

Primero se detectan senales como:

- saludo,
- menu,
- fulfillment,
- pago,
- confirmacion,
- humano,
- direccion simple,
- comprobante por tipo de mensaje.

### 2. El LLM entra como fallback acotado

El router intenta parser semantico solo si el texto parece:

- pedido libre,
- pedido con varias entidades,
- edicion libre del draft,
- frase donde el matcher por reglas puede quedarse corto.

### 3. El LLM no decide negocio

El parser devuelve:

- `intent`,
- `confidence`,
- `items`,
- `editActions`,
- `fulfillmentText`,
- `paymentText`,
- textos de opciones y notas.

No devuelve:

- IDs canonicos,
- precios,
- totales,
- disponibilidad,
- confirmacion final.

### 4. El backend vuelve a resolver todo contra menu real

Despues del parser:

- el backend intenta mapear `productText` al menu activo,
- si no puede, no acepta ciegamente la salida,
- si la confianza es baja, vuelve a aclaracion o flujo deterministico,
- si puede aplicar el cambio, actualiza el draft.

### 5. Toda respuesta deja trazabilidad

Cada outbound registra metadata para saber si fue:

- `deterministic`,
- `llm`,
- `deterministic_after_llm_fallback`.

## Estado actual implementado

- fallback semantico con Gemini via `t-router`,
- configuracion por tenant preparada en DB con fallback real a `GEMINI_API_KEY`,
- soporte para pedidos multi-item simples,
- soporte para ediciones semanticas del draft:
  - agregar,
  - quitar,
  - reemplazar,
  - ajustar cantidad,
- soporte para mezclar senales claras en un mismo mensaje,
- saludos en medio de un pedido activo sin reiniciar la conversacion.

## Limitaciones actuales

- las opciones configurables todavia no se validan de forma robusta contra `product_options`,
- el parser ya devuelve `optionTexts`, pero esas opciones aun no pasan por una capa fuerte de validacion,
- `addressText`, `confirmationText` y `questions` existen en el contrato del parser pero hoy casi no se explotan en el flujo,
- el umbral de confianza es fijo en codigo,
- no hay una suite automatizada amplia de pruebas conversacionales.

## Reglas actuales importantes

### Deterministico

Debe resolver sin IA:

- saludo,
- menu,
- fulfillment,
- pago,
- confirmacion,
- direccion simple,
- ubicacion WhatsApp,
- solicitud de humano,
- comprobante por tipo de mensaje,
- productos simples por numero o alias.

### IA

Debe ayudar en:

- pedido libre con varios productos,
- cambios libres sobre el draft,
- opciones escritas en lenguaje natural,
- notas de producto,
- frases ambiguas pero rescatables.

### Humano

Debe intervenir en:

- comprobantes de transferencia,
- ambiguedad repetida,
- casos especiales,
- reclamos,
- cambios posteriores a una orden ya confirmada por restaurante.

## Estado deseado demo-ready

Para considerar esta capa lista para demos serias, deberiamos cerrar:

1. Validacion de configurables contra `product_options`.
2. Mejor uso de los campos semanticos ya disponibles:
   - `addressText`
   - `confirmationText`
   - `questions`
3. Parametrizacion del umbral de confianza.
4. Pruebas automatizadas de escenarios:
   - pedido natural simple,
   - pedido multi-item,
   - cambio de draft,
   - opciones configurables,
   - fallback a humano.

## Recomendacion de siguientes cambios

### Prioridad 1

- crear una capa de `semantic candidate validation` antes de aceptar opciones configurables,
- separar mejor matcher de producto, matcher de opcion y reglas de draft.

### Prioridad 2

- usar `addressText` del parser cuando el usuario manda una direccion ruidosa,
- aceptar mejor cambios expresados dentro del resumen final.

### Prioridad 3

- registrar metricas simples por intento LLM:
  - intent,
  - confianza,
  - items resueltos,
  - items descartados,
  - razon de fallback.
