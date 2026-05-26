# Plan de conversacion natural deterministica

Ultima actualizacion: 2026-04-29.

## Objetivo

Hacer que el bot se sienta mucho mas natural sin perder control operativo:

- el usuario puede escribir como habla,
- el sistema captura todo lo claro en un solo mensaje,
- el backend sigue calculando precios y validando disponibilidad,
- el LLM solo extrae estructura cuando aporta valor,
- cada respuesta pregunta solo lo que falta.

## Estado actual

Ya existe un flujo guiado persistente:

```txt
hola/menu
-> menu real
-> seleccion por numero, texto o pedido libre multi-producto
-> draft_order
-> agregar mas / seguir con entrega
-> delivery/pickup
-> direccion
-> pago
-> resumen
-> confirmacion
-> order + alerta
```

Implementado al 2026-04-29:

- fallback semantico con Gemini via `t-router`,
- configuracion por tenant preparada en `control.tenant_ai_provider_configs` con fallback MVP a `GEMINI_API_KEY`,
- estado conversacional `awaiting_more_items` para no saltar directo a domicilio/recoger,
- deteccion semantica en estados activos del pedido, no solo en seleccion inicial,
- soporte backend para pedidos multi-producto en una misma frase,
- fallback determinista multi-item para frases simples cuando Gemini no esta configurado o no resuelve,
- trazabilidad de cada outbound en `messages.payload.internal.routing`,
- soporte inicial de edicion semantica del draft: agregar, quitar, reemplazar y ajustar cantidad,
- saludos durante un pedido activo conservan el contexto del draft en vez de reiniciar el flujo.

Limitaciones actuales:

- productos configurables aun no se validan completamente contra `product_options`,
- sin comprobantes de transferencia,
- falta suite automatizada de pruebas conversacionales.

Decisiones ya aclaradas para la siguiente implementacion:

- proveedor LLM inicial: Gemini,
- configuracion por tenant en BD,
- para MVP se usa `GEMINI_API_KEY` en env, dejando lista la tabla por tenant,
- salida LLM solo con textos + confianza,
- aliases en BD primero; dashboard despues,
- migracion de extensiones de `product_options` y aliases ya aplicada en Supabase.

## Principio de balance

Regla corta:

```txt
deterministico para senales cerradas
LLM para entender pedidos libres y configurables
validacion deterministica siempre
humano para operacion sensible o ambigua repetida
```

El LLM no reemplaza la state machine. El LLM solo propone una estructura. El backend decide si esa estructura es aceptable.

## Mensajes que el sistema debe entender claramente

### Saludo y menu

Deterministico.

Ejemplos:

```txt
hola
buenas
que hay hoy
me muestras el menu
quiero pedir
```

Respuesta objetivo:

```txt
Hola, como vas?
Hoy tenemos:
1. Menu del dia - $...
2. Sopa del dia - $...

Escribeme que quieres pedir.
```

Se pueden usar numeros como referencia de productos, pero no como unica forma de interactuar.

### Producto fijo

Deterministico primero.

Ejemplos:

```txt
2 menu del dia
quiero dos sopas
me das una arepa mixta
```

Condicion para aceptar sin LLM:

- match exacto o alias exacto,
- score alto contra un solo producto,
- cantidad clara o default `1`,
- no hay opciones configurables pendientes.

### Producto configurable

Deterministico si aliases y opciones estan configuradas. LLM si la frase es rica o incompleta.

Ejemplos:

```txt
2 menu del dia con sopa de frijoles
almuerzo con pollo a la plancha, arroz y jugo de mora
quiero el menu sin sopa y con limonada
```

Uso recomendado:

- correr matcher deterministico contra producto principal,
- si el producto tiene grupos de opciones, intentar match dentro de cada grupo,
- si faltan opciones requeridas o hay texto que el matcher no ubica, llamar `semantic_order_parse`,
- validar la salida contra las opciones configuradas.

### Fulfillment

Deterministico con fuzzy simple.

Ejemplos aceptados:

```txt
domicilio
domi
envio
para recoger
paso por el
pickup
```

No usar LLM para esto. Si el usuario responde una frase mixta como `a domicilio y pago en efectivo`, el detector debe capturar `delivery` y `cash` en la misma pasada.

Respuesta objetivo:

```txt
Va a domicilio. Enviame la ubicacion de WhatsApp o escribeme la direccion.
```

### Direccion

Deterministico para ubicacion WhatsApp y texto suficiente. LLM solo para limpiar texto con ruido si hace falta.

Ejemplos:

```txt
cra 10 # 20-30 apto 402
en el edificio azul al lado del parque
te mando ubicacion
```

Para V1 no validar zona ni geocodificar. Guardar texto y coordenadas si llegan.

### Pago

Deterministico con typos.

Ejemplos:

```txt
efectivo
efectvo
cash
transferencia
trasnferencia
nequi
daviplata
```

No usar LLM. Esta senal es cerrada y critica.

Respuesta objetivo:

```txt
Perfecto, pago por transferencia.
Te confirmo el pedido:
...
```

### Confirmacion

Deterministico.

Ejemplos positivos:

```txt
si
si esta bien
dale
confirmo
confirmado
listo
ok
```

Ejemplos negativos/cambio:

```txt
no
cancelar
mejor cambiemos
cambia la direccion
quita uno
```

No usar LLM para crear orden. Si la frase contiene cambio concreto, intentar extraerlo; si no se puede, pedir una aclaracion o pasar a humano.

### Handoff

Deterministico.

Ejemplos:

```txt
asesor
humano
quiero hablar con alguien
tengo un problema
```

Debe:

- marcar conversacion `manual`,
- crear alerta persistida,
- detener auto-respuestas,
- mantener visible el contexto para dashboard.

### Comprobante

Deterministico por tipo de mensaje y estado.

Ejemplos:

```txt
[imagen]
[documento]
ya pague
te mando comprobante
```

Si la conversacion esta en `awaiting_transfer_proof`, cualquier imagen/documento debe tratarse como comprobante candidato:

- descargar media de Meta,
- subir a `payment-proofs`,
- relacionar archivo con mensaje/order,
- crear o actualizar alerta `transfer_payment_review`,
- pasar a `manual`.

## Cuando llamar LLM

Llamar LLM en `semantic_order_parse` cuando:

- el usuario escribe pedido libre completo,
- hay producto configurable con opciones en lenguaje natural,
- hay varias entidades en una frase y el deterministico queda incompleto,
- el usuario agrega productos cuando el flujo estaba preguntando entrega, direccion, pago o confirmacion,
- el usuario pide editar el draft: quitar, cambiar, reemplazar o ajustar cantidades,
- hay notas relevantes: `sin cebolla`, `bien asado`, `poca salsa`,
- el matcher de producto queda en zona gris,
- el mensaje contiene mas informacion que un selector simple.

Ejemplos:

```txt
quiero dos menus del dia con sopa de frijoles, uno con pollo y otro con carne
mandame una arepa mixta sin salsas y una limonada
para domicilio en la 10 con 20 y pago por nequi
```

No llamar LLM cuando:

- el estado espera pago y el texto parece pago,
- el estado espera delivery/pickup y el texto parece fulfillment,
- el usuario confirma/cancela,
- el usuario pide asesor,
- llega ubicacion WhatsApp,
- el mensaje solo pide menu o saluda,
- hay que calcular precio o stock.

## Contrato recomendado de salida LLM

El parser debe devolver JSON estricto con textos y confianza:

```json
{
  "intent": "order",
  "confidence": 0.86,
  "items": [
    {
      "quantity": 2,
      "productText": "menu del dia",
      "confidence": 0.91,
      "optionTexts": [
        { "groupText": "sopa", "valueText": "frijoles", "confidence": 0.88 }
      ],
      "notes": []
    }
  ],
  "fulfillmentText": "domicilio",
  "paymentText": "nequi",
  "addressText": null,
  "confirmationText": null,
  "needsHuman": false,
  "questions": []
}
```

El LLM no devuelve:

- `product_id`,
- `menu_item_id`,
- `option_id`,
- precios,
- totales,
- disponibilidad final,
- estado final de orden.

El backend convierte textos a IDs con matcher deterministico contra el menu activo.

## Observabilidad de decisiones

Cada mensaje outbound debe poder explicar por que mecanismo fue producido:

```txt
messages.payload.internal.routing.responseSource
```

Valores:

- `deterministic`: respuesta resuelta sin LLM,
- `llm`: Gemini produjo estructura usada por el backend,
- `deterministic_after_llm_fallback`: se intento Gemini, pero el backend continuo por ruta deterministica.

La metadata tambien registra timestamp, estado conversacional, mensaje inbound relacionado y detalles del intento LLM como outcome, intent, confianza y conteo de items/acciones.

## Configuracion LLM por tenant

Decision:

- proveedor inicial: Gemini,
- un provider activo por tenant en V1,
- auth inicial por API key.

Tabla recomendada:

```txt
control.tenant_ai_provider_configs
  tenant_id
  provider_id                 -- gemini | openai | openrouter
  auth_mode                   -- api_key
  encrypted_api_key
  default_model
  provider_extra              -- jsonb
  status                      -- active | inactive
  created_at
  updated_at
```

Seguridad:

- guardar metadata no sensible en DB,
- guardar API key cifrada en DB,
- usar una clave maestra de cifrado como secret del backend,
- nunca exponer la API key al dashboard,
- el Worker descifra solo en runtime para llamar `t-router`.

Para MVP local/staging se puede permitir fallback por env var si no existe fila activa, pero el camino de producto debe ser config por tenant.

## Arquitectura recomendada

### 1. `message_normalizer`

Responsable de:

- lower-case,
- quitar tildes,
- quitar puntuacion irrelevante,
- colapsar espacios,
- corregir typos frecuentes con diccionario controlado,
- mantener texto original para logs y LLM.

### 2. `signal_detector`

Devuelve multiples senales, no una sola intencion:

```ts
{
  humanRequested?: boolean;
  wantsMenu?: boolean;
  fulfillmentType?: "delivery" | "pickup";
  paymentMethod?: "cash" | "transfer";
  confirmation?: "yes" | "no" | "change";
  hasMediaProof?: boolean;
  addressText?: string;
}
```

### 3. `order_phrase_parser`

Primero deterministico:

- cantidad,
- seleccion por numero,
- match por alias,
- match fuzzy conservador.

Luego LLM si aplica.

### 4. `catalog_matcher`

Unico punto que convierte texto a productos/opciones reales.

Reglas:

- aceptar `>= 0.90`,
- aceptar `0.75 - 0.89` solo si no hay competidor cercano y el estado ayuda,
- aclarar si diferencia entre primero y segundo es `< 0.10`,
- nunca inventar productos.

### 5. `slot_filling_policy`

Decide el proximo dato faltante:

1. producto/opciones requeridas,
2. fulfillment,
3. direccion si delivery,
4. pago,
5. confirmacion.

Debe capturar datos anticipados. Si el usuario dice `a domicilio y pago en efectivo`, no se vuelven a preguntar esos datos.

### 6. `response_composer`

Genera texto desde un resultado estructurado.

Reglas:

- una pregunta por mensaje,
- maximo 4-6 lineas salvo menu/resumen,
- no usar listas numeradas para pago o delivery,
- variar frases con plantillas deterministicas por estado,
- usar el nombre del restaurante y productos reales,
- evitar promesas que dependan de cocina.

### 7. `semantic_parser`

Usa `t-router` para llamar Gemini segun la configuracion activa del tenant.

Entrada:

- texto original,
- estado conversacional,
- menu activo reducido,
- productos/opciones/aliases permitidos,
- schema de salida.

Salida:

- candidato estructurado,
- confianza,
- campos faltantes,
- preguntas sugeridas opcionales.

### 8. Aliases en BD

Los aliases sirven para que el matcher deterministico entienda formas reales en las que los usuarios nombran productos y opciones.

Ejemplos:

```txt
Almuerzo del dia -> menu del dia, corrientazo, almuerzo
Sopa de frijoles -> frijoles, sopita de frijol
Transferencia -> nequi, daviplata, transfe, trasnferencia
```

Influyen en:

- matching de producto por texto,
- matching de opciones configurables,
- decision de si se acepta directo, se aclara o se llama LLM,
- reduccion de llamadas LLM,
- calidad del resumen final.

Inicialmente se guardan en BD. Luego el dashboard debe permitir administrarlos.

### 9. Conversacion manual

`manual` significa que el bot deja de responder automaticamente porque una persona debe tomar el caso.

Casos:

- el usuario pide asesor,
- llega comprobante de transferencia,
- hay ambiguedad despues de 2 aclaraciones,
- hay reclamo o condicion no soportada,
- el cliente quiere cambiar una orden ya confirmada.

Implicaciones:

- la conversacion debe seguir siendo la conversacion activa del cliente,
- los mensajes nuevos deben guardarse ahi,
- no se debe crear una conversacion nueva que reactive el bot automaticamente,
- se debe crear una alerta visible en dashboard,
- el restaurante debe ver contexto, mensajes y pedido relacionado,
- una persona puede resolver el caso y eventualmente reactivar automatizacion.

## Orden de implementacion

1. Extraer `normalizeText`, parsers de pago/fulfillment/confirmacion y matching a modulos testeables.
2. Agregar diccionario de typos y sinonimos para senales cerradas.
3. Hacer que el router capture multiples senales por mensaje.
4. Cambiar prompts de fulfillment/pago para que sean naturales, sin `1. Efectivo / 2. Transferencia`.
5. Implementar `response_composer`.
6. Agregar soporte de aliases en productos y menu items desde BD.
7. Modelar configurables en tipos/API/dashboard usando la migracion ya aplicada.
8. Agregar tabla/configuracion `control.tenant_ai_provider_configs`.
9. Implementar `semantic_order_parse` via `t-router` + Gemini.
10. Agregar procesamiento multi-item y edicion semantica del draft.
11. Agregar validacion post-LLM contra menu activo.
12. Corregir comportamiento de conversaciones `manual`.
13. Agregar tests unitarios para mensajes representativos.
14. Probar en staging con conversaciones reales.

## Suite minima de pruebas conversacionales

```txt
hola
2 menu del dia
2 menu del dia con sopa de frijoles
quiero dos menus del dia a domicilio
a domicilio y pago en efectivo
trasnferencia
si esta bien
mejor cambiemos la direccion
asesor
[ubicacion WhatsApp]
[imagen en awaiting_transfer_proof]
```

## Criterio de exito

- El 80% de conversaciones comunes avanzan sin botones ni menus numerados para decisiones binarias.
- Las frases multi-entidad no repreguntan datos ya dados.
- El LLM se usa solo cuando agrega comprension semantica.
- Cada orden final tiene resumen, total calculado por backend y confirmacion explicita.
- Las conversaciones ambiguas terminan en aclaracion corta o handoff, no en invencion.
