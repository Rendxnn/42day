# Estandar de ingenieria y estructura del monorepo

## Proposito

Este documento es la fuente canonica de reglas de arquitectura e ingenieria para el repositorio.

Cuando exista conflicto entre este documento y descripciones mas viejas en otros archivos, este documento tiene prioridad.

Tambien define la estructura objetivo hacia la que vamos a migrar de forma incremental. El codigo actual todavia puede contener patrones heredados o transicionales, pero eso no autoriza a repetirlos en trabajo nuevo.

## Alcance y fuerza de la regla

Estas reglas aplican a todo el repositorio.

- todo codigo nuevo DEBE seguir estas reglas,
- todo cambio sustancial sobre codigo existente DEBE acercar la zona tocada a esta estructura,
- el codigo heredado puede permanecer temporalmente hasta ser tocado,
- el codigo heredado NO DEBE usarse como precedente para trabajo nuevo,
- cualquier desvio intencional DEBE explicarse explicitamente en la tarea o PR.

## Objetivo del monorepo

Mantener backend, frontend, tipos, schema, logica de negocio y documentacion en un solo repositorio, con limites claros para que el proyecto crezca de forma sostenible, entendible y mantenible.

## Layout actual del repo

```txt
apps/
  api/
    src/
      routes/
      features/
      modules/
      shared/
      lib/
    README.md

  dashboard/
    README.md

packages/
  core/
  db/
  types/
  config/
  prompts/
  t-router/

docs/
```

## Estructura objetivo para `apps/api`

Toda nueva implementacion o migracion incremental DEBE tender a esta forma:

```txt
apps/api/src/
  routes/
  features/
    <capability>/
      use-cases/
      domain/
      ports/
      adapters/
  shared/
  lib/
```

Convenciones:

- `routes/*` contiene solo transporte HTTP.
- `features/<capability>/use-cases/*` contiene solo orquestacion de aplicacion.
- `features/<capability>/domain/*` contiene modelo y reglas del negocio de esa capacidad.
- `features/<capability>/ports/*` contiene solo interfaces hacia persistencia, mensajeria, IA, storage, tiempo, ids y otros servicios externos.
- `features/<capability>/adapters/*` contiene implementaciones concretas de esos puertos.

La forma plana basada solo en `router.ts`, `service.ts` o `repository.ts` por feature se considera transicional. Puede seguir existiendo en zonas heredadas, pero NO es la estructura deseada para codigo nuevo.

## Responsabilidades por capa

### `routes/*`

DEBE encargarse solo de:

- recibir requests HTTP,
- extraer auth y contexto de transporte,
- parsear y validar input de transporte,
- invocar use cases,
- mapear respuestas y errores al contrato HTTP.

NO DEBE contener:

- reglas de negocio,
- orquestacion conversacional,
- acceso directo a detalles de proveedores salvo necesidades de transporte,
- decisiones de dominio,
- logica de persistencia.

### `features/<capability>/use-cases/*`

DEBE encargarse solo de:

- coordinar flujos de aplicacion,
- invocar puertos y servicios de dominio,
- manejar secuencias, transacciones logicas y casos de uso,
- preservar el comportamiento observable del feature.

NO DEBE contener:

- detalles concretos de Supabase, Hono, Cloudflare, Meta, Gemini, OpenRouter o storage,
- modelos de transporte HTTP,
- reglas de dominio que deban vivir como logica pura.

### `features/<capability>/domain/*`

DEBE contener:

- entidades,
- value objects,
- invariantes,
- reglas puras,
- servicios de dominio,
- errores de dominio,
- logica de negocio que no dependa del framework ni del proveedor.

NO DEBE depender de:

- Hono,
- Cloudflare,
- Supabase,
- `fetch`,
- variables de entorno,
- SDKs de proveedores,
- payloads de transporte HTTP.

### `features/<capability>/ports/*`

DEBE contener solo interfaces para:

- persistencia,
- mensajeria,
- IA,
- storage,
- clocks,
- ids,
- otros sistemas externos no pertenecientes al dominio.

NO DEBE contener implementaciones concretas.

### `features/<capability>/adapters/*`

DEBE contener:

- implementaciones concretas de puertos,
- mapeos hacia proveedores,
- llamadas a SDKs, REST APIs, storage, DB o runtime.

NO DEBE contener reglas de dominio embebidas que despues sean dificiles de testear de forma aislada.

### `modules/*`

`modules/*` es una zona transicional de compatibilidad heredada.

- PUEDE seguir existiendo mientras reduce churn en migraciones,
- NO DEBE recibir logica de negocio nueva,
- NO DEBE crecer como capa permanente,
- cualquier wrapper nuevo dentro de `modules/*` DEBE declararse explicitamente como transicional.

### `shared/*` y `lib/*`

- `shared/*` DEBE usarse para utilidades y errores transversales realmente compartidos.
- `lib/*` DEBE usarse para helpers de infraestructura o wiring tecnico que no pertenecen a un feature concreto.
- Ninguna de estas carpetas DEBE convertirse en un deposito generico de logica de negocio.

## Responsabilidades por area del repo

### `apps/api`

Backend ejecutado en Cloudflare Workers.

DEBE contener:

- transporte HTTP,
- webhook de WhatsApp,
- casos de uso,
- adaptadores a proveedores,
- integracion con DB, auth y storage,
- orquestacion de flujos de aplicacion.

NO DEBE concentrar:

- reglas de negocio puras que puedan vivir en `domain/*` o `packages/core`,
- contratos compartidos que tambien necesite el dashboard,
- dependencias de infraestructura filtradas dentro de la capa de dominio.

### `apps/dashboard`

Aplicacion web del restaurante.

DEBE contener:

- vistas,
- componentes,
- estado de UI,
- llamadas al API,
- experiencia operativa del usuario.

NO DEBE contener:

- calculo final de precios,
- validacion final de disponibilidad,
- decisiones de negocio que pertenecen al backend,
- acceso a internals privados de `apps/api`.

### `packages/core`

Contiene logica de dominio pura y compartida entre contextos.

DEBE contener:

- reglas puras,
- validaciones puras,
- helpers de dominio compartidos.

NO DEBE depender de:

- `apps/api`,
- Hono,
- Supabase,
- Cloudflare,
- SDKs de proveedores,
- runtime de frontend.

### `packages/db`

Contiene schema, migraciones, seeds y artefactos relacionados a base de datos.

### `packages/types`

Contiene contratos compartidos entre aplicaciones.

- request/response contracts compartidos DEBEN vivir aqui,
- tipos internos de persistencia o payloads de proveedor NO DEBEN filtrarse aqui salvo que formen parte del contrato publico.

### `packages/config`

Contiene validacion de variables de entorno y configuracion por ambiente.

### `packages/prompts`

Contiene prompts versionados y artefactos relacionados al parsing semantico.

## Direccion permitida de dependencias

Regla principal:

```txt
routes -> use-cases
use-cases -> domain, ports
adapters -> ports, external libs
domain -> sin dependencias de framework o infra
```

Adicionalmente:

```txt
apps/api -> packages/*
apps/dashboard -> packages/types, packages/config
packages/core -> packages/types
packages/db -> packages/types
packages/prompts -> packages/types
```

Restricciones:

- `domain/*` NO DEBE importar adaptadores ni frameworks.
- `routes/*` NO DEBE importar proveedores directamente para resolver negocio.
- frontend y packages compartidos PUEDEN consumir contratos compartidos, pero NO DEBEN importar internals privados del backend.

## Reglas de naming y ubicacion

- las carpetas DEBEN organizarse por capability primero, no por tecnologia,
- los nombres de archivo DEBEN describir el rol arquitectonico con claridad,
- preferir nombres como:
  - `create-order.use-case.ts`
  - `order.repository.port.ts`
  - `supabase-order.repository.ts`
- evitar nombres ambiguos como `utils.ts`, `helpers.ts` o `service.ts` cuando el rol real pueda nombrarse mejor.

## Regla de propiedad de contratos

- los contratos compartidos entre apps DEBEN vivir en `packages/types`,
- las filas de persistencia, payloads de proveedor y detalles internos de adaptadores NO DEBEN filtrarse como contratos publicos,
- el backend DEBE mapear explicitamente entre modelos internos y contratos externos cuando haga falta.

## Regla de manejo de errores

- los errores de dominio DEBEN ser explicitos y modelados como parte de la capa de dominio o del caso de uso,
- el mapeo a HTTP, status codes o payloads de error DEBE ocurrir en el borde de transporte,
- los fallos especificos de proveedor NO DEBEN escapar como si fueran comportamiento de dominio.

## Regla de documentacion de codigo

Todo codigo nuevo o sustancialmente modificado DEBE seguir esta regla:

- toda funcion exportada,
- todo metodo exportado o publico,
- toda clase,
- todo type o interface exportado,
- toda estructura interna no obvia

DEBE tener un resumen breve inmediatamente antes de su definicion.

Excepcion:

- helpers privados triviales pueden omitir comentario si el nombre y el cuerpo son completamente evidentes.

Estilo esperado:

- 1 a 3 lineas en la mayoria de los casos,
- lenguaje simple,
- explicar responsabilidad, intencion o invariante,
- NO narrar sintaxis obvia,
- NO escribir comentarios redundantes como "asigna el valor" o "itera el array".

## Politica TDD obligatoria

Todo feature nuevo, bug fix o cambio de comportamiento DEBE seguir TDD.

Secuencia obligatoria:

1. definir primero los casos de prueba,
2. escribir o actualizar primero pruebas que fallen,
3. implementar el minimo codigo necesario para pasar,
4. refactorizar solo despues de tener pruebas en verde,
5. NO debilitar ni reescribir pruebas para acomodar una implementacion incorrecta,
6. si una prueba estaba mal definida, corregirla de forma intencional y documentar el motivo antes de continuar.

Alcance:

- obligatorio para nuevas features,
- obligatorio para bug fixes,
- obligatorio para cambios de comportamiento,
- para hotfixes sobre zonas heredadas donde el test-first sea dificil, DEBEN agregarse characterization tests primero cuando sea razonablemente posible,
- cambios solo de documentacion o copy no requieren TDD.

Niveles esperados de prueba:

- `domain/*`: unit tests rapidos y puros,
- `use-cases/*`: pruebas de aplicacion con puertos mockeados o fakes,
- `adapters/*`: integracion enfocada cuando aporte valor real,
- `routes/*`: pruebas de contrato o transporte para endpoints importantes,
- todo bug de produccion DEBE dejar cobertura de regresion.

## Regla de determinismo en tests

- los tests NO DEBEN depender de red real, tiempo real ni azar, salvo pruebas marcadas explicitamente como integracion o E2E,
- tiempo, ids y otras fuentes de no determinismo DEBEN pasar por puertos, fakes o seams testeables,
- una prueba flaky se considera un bug del sistema de pruebas y debe tratarse como tal.

## Regla de migracion incremental

Cuando se toque una zona heredada:

- migrar solo el comportamiento tocado hacia la estructura objetivo,
- NO hacer rewrites oportunistas grandes salvo que la tarea sea explicitamente de refactor,
- preservar comportamiento externo mientras cambia la implementacion interna,
- dejar la zona tocada con fronteras mas claras que antes,
- NO introducir nuevas abstracciones "temporales" sin nombrarlas como transicionales y explicar por que existen.

## Regla de frescura documental

Cuando un cambio haga que codigo y documentacion diverjan:

- la documentacion afectada DEBE actualizarse en la misma tarea,
- si una doc vieja queda parcialmente desactualizada pero todavia sirve como contexto, DEBE marcarse explicitamente como historica o transicional,
- no se debe dejar una arquitectura objetivo nueva solo "entendida verbalmente".

## Review y Definition of Done

Todo cambio nuevo o sustancialmente modificado DEBE cumplir:

- se respetaron las fronteras de arquitectura,
- los tests se definieron primero o existe una excepcion justificada,
- pasaron todos los tests relevantes,
- no se agrego logica de negocio nueva en `routes/*`,
- no se agrego logica de negocio nueva en `modules/*`,
- no se agregaron imports de infraestructura o proveedores dentro de `domain/*`,
- el codigo publico o no obvio tiene resumenes breves antes de su definicion,
- la documentacion fue actualizada si cambio arquitectura, flujo o comportamiento,
- cualquier desviacion intencional de este estandar quedo registrada en la tarea o PR.

## Convencion de trabajo con frontend

El frontend consume el backend real via `apps/api`.

Eso significa:

- las reglas de negocio finales viven en backend,
- el frontend presenta y opera sobre contratos publicos,
- la UI no debe duplicar decisiones finales de negocio,
- las mejoras de dashboard deben seguir sus propias convenciones visuales, pero respetando los contratos y limites de capas definidos aqui.

## Checklist de cierre para cambios de arquitectura o comportamiento

- el cambio sigue la direccion de dependencias definida aqui,
- las capas quedaron mas claras que antes,
- los tests cubren el comportamiento deseado,
- el comentario o resumen previo existe donde corresponde,
- los contratos publicos no filtran modelos internos por accidente,
- la documentacion principal sigue consistente.
