# Plan de continuacion del refactor de API

Ultima actualizacion: 2026-06-09.

## Objetivo

Completar la parte pendiente del refactor interno de `apps/api` sin cambiar:

- contratos HTTP,
- payloads,
- textos outbound,
- transiciones conversacionales observables,
- side effects operativos en DB,
- integracion con WhatsApp.

El objetivo no es agregar features nuevas. Es terminar de ordenar la implementacion para que el backend quede mas mantenible, testeable y seguro para seguir iterando sobre el flujo demo-ready.

## Punto de partida verificado

Estado base sobre el que continua este plan:

- commit de referencia reciente: `a8499a3`
- `routes/dashboard.ts` y `modules/message-router/router.ts` ya son fachadas finas
- `features/chat-routing/*`, `features/conversations/*`, `features/menu/*`, `features/product-configurator/*` y `features/payment-proofs/*` ya existen
- bloques demo-ready ya cerrados en codigo:
  - configurables con validacion deterministica y aclaracion conversacional
  - transferencia con almacenamiento de comprobante y revision minima
- `features/dashboard/router.ts` ya fue partido en subrouters por dominio
- `features/chat-routing/router.ts` ya quedo reducido a coordinacion y delegacion de handlers
- `features/draft-orders/service.ts` ya separo mappers, matching y repository
- `features/orders/service.ts` ya separo mappers, repository, alerts y replacements

Validaciones que ya pasaron en este punto:

- `npm run test --prefix apps/api`
- `corepack pnpm typecheck:direct`

Nota de entorno:

- el `build` del dashboard puede fallar localmente por una dependencia nativa faltante de `rolldown`; no usar ese fallo como senal de regresion funcional del API.

## Restricciones no negociables

1. No cambiar rutas, metodos, status codes ni shape de respuestas.
2. No cambiar los textos que hoy se envian a WhatsApp.
3. No cambiar el comportamiento observable del flujo conversacional.
4. No mezclar mejoras funcionales nuevas dentro del refactor.
5. No introducir capas ceremoniosas o abstracciones genericas sin necesidad.
6. Mantener el enfoque actual: funciones explicitas por feature, repositorios concretos y fachadas de compatibilidad mientras hagan falta.

## Hotspots pendientes reales

Archivos mas cargados hoy:

```txt
apps/api/src/features/chat-routing/router.ts    ~coordinador + handlers
apps/api/src/features/orders/service.ts         ~coordinador de casos de uso
apps/api/src/features/draft-orders/service.ts    ~capa de aplicacion reducida
apps/api/src/lib/supabase-rest.ts               ~273 lineas
```

Puntos de deuda concretos:

- `chat-routing/router.ts` ya no es monolitico, pero aun hay handlers que pueden seguir afinandose por dominio si reaparece complejidad.
- `draft-orders/service.ts` ya dejo de mezclar matching y mapeo, pero aun concentra orquestacion de aplicacion.
- `orders/service.ts` ya separo mapeos, alerts, replacements y repository, pero todavia coordina varias ramas de caso de uso.
- todavia hay imports cruzados desde `features/*` hacia `modules/*` que delatan fronteras incompletas.
- existen modulos nominales o fachadas que deben auditarse al final:
  - `guided-flow-engine`
  - `validation-engine`
  - `pricing-engine`

## Estado objetivo al cerrar este refactor

`apps/api` debe quedar con estas propiedades:

- `routes/*` solo compone routers HTTP.
- `features/dashboard/*` queda dividido por dominio de rutas.
- `features/chat-routing/*` queda dividido por handlers y helpers por flujo.
- `draft-orders` y `orders` separan:
  - servicio de aplicacion,
  - repositorio,
  - mapeos,
  - helpers de dominio o matching.
- las dependencias desde `features/*` a `modules/*` quedan minimizadas o justificadas.
- las fachadas heredadas siguen existiendo solo donde reduzcan churn; si no aportan, se eliminan.
- existe una red minima de caracterizacion automatizada para impedir regresiones durante futuros cambios.

## Estado actual y implicaciones

Lo que ya quedo cerrado:

- `dashboard` quedo dividido por dominios y conserva la fachada externa.
- `chat-routing` quedo particionado en coordinador + handlers por rama.
- `draft-orders` quedo separado en `service`, `repository`, `mappers` y `matching`.
- `orders` quedo separado en `service`, `repository`, `mappers`, `alerts` y `replacements`.
- el baseline del API sigue pasando con `test` y `typecheck:direct`.

Implicaciones operativas:

- el riesgo principal ya no es el tamaño de un monolito unico, sino la estabilidad de las fronteras entre handlers, servicios y repositorios.
- cualquier cambio siguiente debe respetar el orden actual de evaluacion en `chat-routing`, porque ahi viven las transiciones conversacionales observables.
- `orders` y `draft-orders` ya admiten mas descomposicion interna, pero no conviene seguir fragmentandolos si no hay una ganancia real de complejidad.
- el build del dashboard sigue sin ser una senal confiable de regresion funcional del API por la dependencia nativa de `rolldown`.

## Estructura objetivo recomendada

No es necesario llegar a una arquitectura perfecta o dogmatica. La siguiente estructura ya es suficiente:

```txt
apps/api/src/features/
  dashboard/
    auth.ts
    types.ts
    router.ts
    routes/
      admin.ts
      public-carta.ts
      orders.ts
      alerts.ts
      settings.ts
      catalog.ts
      menu.ts
      uploads.ts
      diagnostics.ts
  chat-routing/
    router.ts
    helpers.ts
    outbound.ts
    tracing.ts
    types.ts
    handlers/
      greeting-menu.ts
      transfer-proof.ts
      guided-selection.ts
      semantic-order.ts
      product-configuration.ts
      checkout.ts
      replacements.ts
      clarification.ts
      manual-handoff.ts
  draft-orders/
    service.ts
    repository.ts
    mappers.ts
    matching.ts
  orders/
    service.ts
    repository.ts
    mappers.ts
    replacements.ts
    alerts.ts
```

Esto es una guia. Si durante la implementacion algun corte mas pequeno reduce mejor el riesgo, debe preferirse eso antes que forzar esta forma exacta.

## Plan de trabajo completo

## Fase 0: red de seguridad y baseline

Objetivo:

- congelar el comportamiento antes de mover piezas grandes.

Trabajo:

1. Reconfirmar que siguen pasando:
   - `npm run test --prefix apps/api`
   - `corepack pnpm typecheck:direct`
2. Añadir caracterizacion minima faltante para rutas y flujos mas sensibles antes de moverlos:
   - webhook verify success/failure
   - `routeInboundMessage` en saludo, seleccion guiada, confirmacion, transferencia, reemplazo y handoff
   - dashboard en accept order, reject out-of-stock, retry notification, alerts acknowledge/resolve y automation toggle
3. Mantener stubs o fakes simples para:
   - `sendWhatsAppTextMessage`
   - `logOutboundTextMessage`
   - acceso a Supabase

Criterio de salida:

- existe una base minima para detectar cambios de contrato o side effect al refactorizar.

## Fase 1: partir `features/dashboard/router.ts`

Objetivo:

- convertir `features/dashboard/router.ts` en composicion de subrouters.

Rutas que hoy conviven ahi:

- identidad y tenants: `/tenants`, `/me`
- admin: `/admin/*`
- carta publica: `/public/:tenantSlug/carta`
- menu operativo: `/:tenantSlug/menu/today*`
- pedidos: `/:tenantSlug/orders*`
- comprobantes: `/:tenantSlug/orders/:orderId/payment-proof*`
- alertas: `/:tenantSlug/alerts*`
- settings: `/:tenantSlug/settings/automation`
- catalogo: `/:tenantSlug/products*`
- uploads: `/:tenantSlug/uploads/*`
- diagnostics: `/:tenantSlug/diagnostics`

Trabajo:

1. Crear `features/dashboard/routes/*` por dominio.
2. Dejar `features/dashboard/router.ts` solo como ensamblador:
   - crea el router base,
   - monta subrouters,
   - aplica middleware compartido si hace falta.
3. Mover helpers privados del archivo grande junto al subrouter que realmente los usa.
4. Evitar que cada subrouter reimplemente auth y tenant access:
   - reutilizar `auth.ts`
   - extraer helpers de contexto compartidos si hace falta
5. Mantener el mismo orden de resolucion, codigos y payloads.

Recomendacion de corte:

- primero `admin.ts`
- luego `orders.ts`
- luego `alerts.ts` y `settings.ts`
- luego `catalog.ts`, `menu.ts`, `uploads.ts`, `diagnostics.ts`, `public-carta.ts`

Criterio de salida:

- `features/dashboard/router.ts` queda corto y de composicion
- cada subrouter tiene responsabilidad clara
- no cambia ningun endpoint externo

## Fase 2: partir `features/chat-routing/router.ts`

Objetivo:

- dejar `routeInboundMessage` como coordinador de alto nivel.

Handlers que ya se distinguen claramente dentro del archivo:

- greeting/menu
- transfer proof
- guided selection
- semantic order
- pending product configuration
- checkout: fulfillment, address, payment, confirmation
- replacement selection
- clarification
- manual handoff

Trabajo:

1. Crear `features/chat-routing/handlers/*`.
2. Mover cada bloque a un handler legible en aislamiento.
3. Mantener `router.ts` con estas responsabilidades:
   - construir contexto de entrada
   - detectar early exits
   - decidir orden de evaluacion
   - delegar a handlers
4. Mover helpers internos que hoy solo sirven a un handler al archivo del handler correspondiente.
5. Mantener en archivos compartidos solo lo realmente transversal:
   - `helpers.ts`
   - `outbound.ts`
   - `tracing.ts`
   - `types.ts`

Recomendacion de corte:

1. extraer `transfer-proof.ts`
2. extraer `product-configuration.ts`
3. extraer `replacements.ts`
4. extraer `checkout.ts`
5. extraer `guided-selection.ts` y `semantic-order.ts`
6. extraer `manual-handoff.ts` y `clarification.ts`
7. reducir `router.ts`

Criterios de salida:

- `routeInboundMessage` se puede leer como una secuencia de decisiones
- cada handler tiene entradas y salidas explicitas
- el router deja de contener implementaciones largas de flujo

## Fase 3: normalizar `draft-orders`

Objetivo:

- separar orquestacion, persistencia, mapeo y matching del draft.

Trabajo:

1. Crear `features/draft-orders/repository.ts` para:
   - cargar draft activo
   - cargar items
   - insertar items
   - actualizar draft
   - actualizar cantidades
   - borrar items
2. Crear `features/draft-orders/mappers.ts` para:
   - `DraftOrderRow -> DraftOrder`
   - `DraftOrderItemRow -> OrderLineItem`
3. Crear `features/draft-orders/matching.ts` para:
   - `findMatchingRows`
   - normalizacion de texto
   - singularizacion
4. Dejar `service.ts` como aplicacion:
   - `getOrCreateActiveDraftOrder`
   - `addMenuItemToDraftOrder`
   - `removeItemsFromDraftOrder`
   - `setDraftOrderItemQuantity`
   - `updateDraftOrderFulfillment`
   - `updateDraftOrderDeliveryAddress`
   - `updateDraftOrderPaymentMethod`
5. Mantener `calculateDraftTotals` y `validateDraftForConfirmation` viniendo desde `@42day/core`.

Criterio de salida:

- `service.ts` deja de mezclar detalles de filas y queries con logica de aplicacion
- el matching queda aislado y testeable

Estado:

- esta fase ya se ejecuto en la practica con la separacion a `repository.ts`, `mappers.ts` y `matching.ts`.

## Fase 4: normalizar `orders`

Objetivo:

- separar persistencia, mapeo, alertas y reemplazos.

Trabajo:

1. Crear `features/orders/repository.ts` para:
   - persistencia de `orders`
   - persistencia de `order_items`
   - carga de contexto de reemplazos
   - updates de estado relevantes
2. Crear `features/orders/mappers.ts` para:
   - `OrderRow -> Order`
   - line items hacia rows
3. Crear `features/orders/replacements.ts` para:
   - parse de metadata
   - match de reemplazos
   - actualizacion de draft y order item afectado
4. Crear `features/orders/alerts.ts` para:
   - `buildPendingAlert`
   - `buildAlertRow`
   - metadata de review/replacement
5. Dejar `service.ts` como coordinador de casos de uso:
   - `persistConfirmedOrder`
   - `getPendingCustomerReplacementOrder`
   - `applyCustomerReplacementSelection`
   - `cancelPendingCustomerReplacementOrder`

Criterio de salida:

- `orders/service.ts` deja de contener simultaneamente queries, mappers y flujo de reemplazos
- reemplazos queda aislado como subdominio legible

Estado:

- esta fase tambien ya se ejecuto en la practica con la separacion a `repository.ts`, `mappers.ts`, `alerts.ts` y `replacements.ts`.

## Fase 5: normalizar fronteras y dependencias

Objetivo:

- reducir dependencias heredadas y dejar limites mas coherentes entre `features/*`, `modules/*` y `shared/*`.

Trabajo:

1. Auditar imports desde `features/*` hacia `modules/*`.
2. Mover a `features/*` o `shared/*` lo que hoy siga siendo comportamiento propio del feature y no infraestructura generica.
3. Mantener en `modules/*` solo:
   - integraciones externas,
   - fachadas de compatibilidad,
   - utilidades heredadas aun no migradas.
4. Auditar modulos nominales:
   - `guided-flow-engine`
   - `validation-engine`
   - `pricing-engine`
5. Decidir para cada uno:
   - se conserva como fachada util, o
   - se elimina si no tiene referencias y no aporta compatibilidad real.

Criterio de salida:

- las fronteras del codigo son consistentes
- no quedan fachadas muertas o modulos sin rol claro

Siguiente paso natural:

- auditar imports heredados desde `features/*` hacia `modules/*` y decidir cuales quedan por compatibilidad y cuales ya deben migrar.

## Fase 6: estabilizacion, docs y cleanup final

Objetivo:

- cerrar el refactor con documentacion y verificaciones actualizadas.

Trabajo:

1. Reejecutar:
   - `npm run test --prefix apps/api`
   - `corepack pnpm typecheck:direct`
2. Ampliar README de `apps/api` si la estructura final cambia lo suficiente.
3. Actualizar docs de arquitectura si cambia la organizacion de features.
4. Confirmar que `routes/*` y fachadas heredadas sigan apuntando correctamente a la implementacion nueva.
5. Revisar si hay helpers muertos, tipos duplicados o imports obsoletos.

Criterio de salida:

- el refactor queda coherente y documentado
- no quedan archivos grandes sin justificacion clara

## Orden recomendado de ejecucion real

1. Fase 0: baseline y tests minimos faltantes
2. Fase 1: `dashboard/router.ts`
3. Fase 2: `chat-routing/router.ts`
4. Fase 3: `draft-orders`
5. Fase 4: `orders`
6. Fase 5: fronteras, fachadas y dependencias
7. Fase 6: cleanup, docs y verificacion final

Motivo del orden:

- `dashboard` y `chat-routing` son los monolitos mas visibles
- `draft-orders` y `orders` conviene partirlos despues, cuando los consumidores principales ya esten mas claros
- la limpieza de fachadas tiene menos riesgo al final

## Riesgos y mitigaciones

### Riesgo 1: regresion silenciosa de contratos

Mitigacion:

- tests de caracterizacion
- no cambiar textos ni payloads durante los movimientos

### Riesgo 2: big-bang refactor dificil de revisar

Mitigacion:

- hacer cortes pequenos por dominio o handler
- mantener fachadas temporales cuando reduzcan churn

### Riesgo 3: duplicacion temporal de helpers

Mitigacion:

- tolerar duplicacion chica durante extraccion
- consolidar solo cuando el nuevo corte ya sea estable

### Riesgo 4: mover demasiado pronto modulos heredados

Mitigacion:

- primero extraer implementacion
- luego auditar referencias
- eliminar fachadas solo al final

## Definicion de terminado

El refactor puede considerarse suficientemente cerrado cuando:

- `features/dashboard/router.ts` ya es composicion de subrouters
- `features/chat-routing/router.ts` ya es coordinador de handlers
- `draft-orders` y `orders` separan servicio, repositorio y mappers
- las fachadas heredadas solo existen donde realmente aportan compatibilidad
- la documentacion explica la arquitectura resultante
- sigue pasando el baseline de tests y typecheck

## Siguientes pasos naturales

1. Auditar fronteras `features/*` -> `modules/*` y reducir solo lo que tenga valor real.
2. Revisar si `orders/service.ts` y `draft-orders/service.ts` ameritan un ultimo corte de repositorio para quitarles el resto de SQL directo.
3. Auditar `guided-flow-engine`, `validation-engine` y `pricing-engine` para decidir si siguen como fachadas utiles o si se eliminan.
4. Mantener caracterizacion automatizada enfocada en contratos observables, no en implementacion interna.

## Prompt de handoff para un nuevo agente

Usa este prompt tal cual o con ajustes menores:

```txt
Estas continuando el refactor interno de `apps/api` en el repo `42day`.

Contexto importante:

- Ya se cerro una segunda pasada fuerte del refactor.
- `routes/dashboard.ts` y `modules/message-router/router.ts` hoy son fachadas finas.
- La implementacion real ya vive en `apps/api/src/features/*`.
- Ya existen y estan funcionando:
  - `features/chat-routing/*`
  - `features/conversations/*`
  - `features/menu/*`
  - `features/product-configurator/*`
  - `features/payment-proofs/*`
  - `features/dashboard/auth.ts`
  - `features/dashboard/types.ts`
- Bloque demo-ready 1 y 2 ya quedaron implementados:
  - configurables con resolucion deterministica y aclaracion conversacional
  - transferencia con descarga de media, `payment_proofs` y revision minima desde dashboard
- Commit de referencia reciente: `a8499a3`

Estado validado:

- `npm run test --prefix apps/api` pasa
- `corepack pnpm typecheck:direct` pasa
- El build del dashboard puede fallar por una dependencia nativa faltante de `rolldown`; no tomes eso como regresion funcional del API

Restricciones del refactor:

- No cambies rutas HTTP, payloads, status codes ni contratos publicos
- No cambies textos outbound de WhatsApp
- No cambies transiciones conversacionales ni side effects observables
- No metas mejoras funcionales nuevas dentro del refactor
- Usa `apply_patch` para editar archivos
- Mantente incremental; evita un big-bang

Hotspots pendientes:

- `apps/api/src/features/dashboard/router.ts` sigue siendo demasiado grande
- `apps/api/src/features/chat-routing/router.ts` sigue siendo demasiado grande
- `apps/api/src/features/draft-orders/service.ts` mezcla servicio, queries y mapeos
- `apps/api/src/features/orders/service.ts` mezcla servicio, queries, mapeos y reemplazos
- Aun hay fronteras incompletas entre `features/*` y `modules/*`

Tu fuente de verdad para continuar es:

- `docs/planning/api-refactor-continuation-plan.md`
- `docs/architecture/backend.md`
- `apps/api/README.md`

Lo que quiero que hagas ahora:

1. Lee `docs/planning/api-refactor-continuation-plan.md` y confirma el siguiente corte de trabajo mas seguro.
2. Empieza por la siguiente fase pendiente, de forma incremental.
3. Antes de mover codigo grande, corre el baseline disponible.
4. Implementa el corte completo, verificando que no cambie comportamiento.
5. Al final explica:
   - que quedo movido
   - que sigue pendiente
   - que validaciones corriste

Prioridad recomendada:

1. Partir `features/dashboard/router.ts` en subrouters de dominio
2. Luego partir `features/chat-routing/router.ts` en handlers
3. Luego normalizar `draft-orders` y `orders`

No necesito teoria. Necesito ejecucion segura, incremental y sin cambio funcional.
```
