# Arquitectura frontend del dashboard

Este documento es la **fuente canónica** para la arquitectura del dashboard de 42day.

Su propósito no es solo describir el estado actual, sino dejar explícito:

- la arquitectura objetivo,
- qué partes ya siguen esa arquitectura,
- qué partes todavía no,
- y cómo debe hacerse la transición **sin frenar el desarrollo funcional**.

Si otro documento de planning o de estado menciona una estructura distinta o más vieja, este archivo tiene prioridad.

## Decisión arquitectónica adoptada

El dashboard adopta una arquitectura **Gradual Feature-First Hybrid**.

Eso significa:

- `App.tsx` debe actuar como **shell/orquestador**,
- la lógica grande y específica de negocio debe vivir por **feature** en `src/features/<feature>/`,
- la migración será **gradual**, no un refactor masivo aparte,
- las capas compartidas se mantienen mínimas y pragmáticas,
- no se adopta por ahora una arquitectura pesada tipo clean architecture estricta.

## Qué problema resuelve esta decisión

Esta decisión existe para atacar problemas que hoy ya se sienten en el repo:

- archivos demasiado grandes con responsabilidades mezcladas,
- conflictos de merge frecuentes sobre `App.tsx` y módulos grandes,
- dificultad para trabajar en paralelo sin pisarse,
- revisión de cambios más difícil,
- menor mantenibilidad y más riesgo al tocar UI existente.

La meta es mejorar estructura **mientras el producto sigue avanzando**, no detener el roadmap para hacer un refactor “big bang”.

## Estado actual

Hoy el dashboard está en una etapa intermedia.

### Ya alineado con la dirección objetivo

- `features/configuration/*` ya es un ejemplo real del patrón esperado,
- `features/orders/*` ya concentra la vista y componentes operativos de pedidos,
- `Configuración` ya concentra `Subida`, pagos y cobertura de domicilios como un solo feature,
- la lógica de integración de pagos ya salió del cuerpo principal de `App.tsx`,
- el backend del dashboard ya usa router modular como camino live.

### Conversaciones abiertas y alertas

`orders.tsx` contiene por ahora la vista operativa de pedidos y conversaciones abiertas. Cada tarjeta abierta, incluso una conversacion sin draft ni pedido, puede abrir un detalle compacto con el switch accesible de automatizacion (`role="switch"`, estado ocupado y confirmacion antes de pausar). El detalle operativo de pedido usa el mismo control.

La mutacion no escribe tablas tenant desde el navegador: llama a la Dashboard API, que a su vez ejecuta la RPC local del tenant. Auth y la suscripcion Realtime son las excepciones directas del frontend a esta frontera; los datos y mutaciones de negocio viajan por API.

La campana del shell escucha pedidos y `human_intervention_alerts`. Mantiene los IDs vistos solo en memoria de la sesion, por lo que una alerta nueva recibe sonido/toast/notificacion nativa una vez, y una carga inicial no reproduce alertas anteriores.

### Todavía con deuda estructural importante

- `apps/dashboard/src/App.tsx` sigue siendo demasiado grande y mezcla shell con varias áreas funcionales,
- todavía quedan areas de menu, catalogo y admin acopladas al shell,
- la consola admin todavía vive mayormente dentro de `App.tsx`,
- menú y catálogo todavía siguen demasiado acoplados al shell,
- `apps/dashboard/src/api.ts` sigue centralizado, lo cual es aceptable por ahora, pero debe mantenerse bajo control.

## Estructura objetivo

La estructura objetivo es **una guía flexible**, no una plantilla rígida.

Pueden aparecer nuevos features y nuevas carpetas según lo necesite el producto, siempre que respeten la separación de responsabilidades.

### Base del dashboard

- `apps/dashboard/src/App.tsx`
  - shell de aplicación
  - bootstrap de sesión/auth
  - selección de tenant
  - navegación top-level
  - toasts, notificaciones y wiring de features
- `apps/dashboard/src/main.tsx`
  - bootstrap del frontend
- `apps/dashboard/src/auth.ts`
  - integración de autenticación
- `apps/dashboard/src/i18n.tsx`
  - locale provider y helpers globales de formato
- `apps/dashboard/src/api.ts`
  - request helpers compartidos por ahora
  - cliente centralizado en esta etapa
- `apps/dashboard/src/styles.css`
  - estilos globales

### Estructura por feature

Cada feature compleja debe tender a vivir en:

- `apps/dashboard/src/features/<feature-name>/`

La forma interna puede variar, pero el patrón esperado es este:

- `<Feature>View.tsx`
  - contenedor/orquestador del feature
- `components/` o archivos de secciones
  - UI específica del feature
- `types.ts`
  - tipos propios del feature cuando realmente agregan claridad
- `hooks.ts`
  - hooks locales si el feature ya lo justifica
- `adapter.ts` / `*.http.ts` / `*.mock.ts`
  - cuando conviene desacoplar integración o contratos
- `utils.ts`
  - helpers locales del feature

No todos los features necesitan todas esas piezas. Esta guía es evolutiva, no un checklist obligatorio.

### Features objetivo de referencia

La dirección esperada del dashboard incluye al menos:

- `features/configuration/`
- `features/orders/`
- `features/menu/`
- `features/catalog/`
- `features/admin/`
- otros features futuros según necesidades del producto

## Capas y límites que sí usamos

La separación esperada del dashboard es pragmática:

- **Shell/App**
  - composición de alto nivel
  - auth y tenant context
  - navegación y layout
- **Features**
  - lógica, estado y UI de una capacidad del producto
- **Integración/API**
  - request helpers, adapters y contratos frontend-backend
- **Auth/i18n**
  - piezas transversales ya compartidas
- **Shared**
  - solo cuando exista reutilización real entre múltiples features

## Capas que explícitamente no usamos por ahora

No queremos introducir, por defecto:

- una clean architecture estricta con múltiples niveles abstractos,
- una separación global en `entities/use-cases/repositories/presenters`,
- una capa `shared/` masiva desde el inicio,
- abstracciones genéricas prematuras que compliquen más de lo que ayudan.

## Definición de responsabilidades

### Qué sí puede vivir en `App.tsx`

- bootstrap de sesión
- carga inicial de tenants
- selección del top-level view
- wiring de props hacia features
- estado global realmente transversal
- layout, navegación y notificaciones del shell

### Qué no debe seguir entrando a `App.tsx`

- formularios grandes de negocio
- paneles CRUD específicos de un módulo
- detalles operativos completos de pedidos
- flujos admin completos
- lógica nueva de features que ya merecen carpeta propia

### Qué debe vivir en un feature

- estado específico de negocio
- loaders y mutaciones propios del módulo
- subcomponentes operativos
- validaciones de UI del módulo
- adapters o helpers locales si aclaran el flujo

### Cuándo algo debe ir a `shared`

Solo debe ir a `shared` si:

- se usa de verdad en múltiples features,
- tiene una responsabilidad transversal clara,
- y moverlo allí reduce acoplamiento en vez de aumentarlo.

Evitar `shared` prematuro. Un `shared/` mal usado termina siendo un depósito genérico difícil de mantener.

## Reglas de migración gradual

La transición estructural del dashboard debe seguir estas reglas:

- no abrir un refactor transversal solo por “limpieza”,
- si un área grande va a recibir cambios sustanciales, aprovechar ese trabajo para extraer estructura en esa misma zona,
- no agregar lógica de negocio nueva a `App.tsx` si ya pertenece claramente a un feature,
- no crear capas abstractas nuevas sin una necesidad real,
- no crear `shared/` por anticipación,
- preferir mejoras incrementales ligadas a trabajo funcional real.

En otras palabras: cada cambio futuro importante debe intentar dejar **mejor** la estructura del área que toca.

## Anti-patrones

Evitar explícitamente:

- reintroducir una vista top-level antigua cuando ya pasó a ser sección interna de un feature,
- copiar lógica de un feature dentro del shell,
- mezclar UI operativa, loaders y wiring global en el mismo bloque enorme,
- mover código a `shared/` solo porque “podría servir después”,
- tratar documentos de planning como si fueran la arquitectura normativa vigente.

## Guía práctica para próximas extracciones

Los siguientes candidatos naturales ya están identificados:

- `apps/dashboard/src/orders.tsx` -> `features/orders/*`
- consola admin hoy dentro de `App.tsx` -> `features/admin/*`
- bloques de menú dentro de `App.tsx` -> `features/menu/*`
- bloques de catálogo dentro de `App.tsx` -> `features/catalog/*`

Esto **no** implica un compromiso de refactor inmediato. Es la dirección esperada cuando esas áreas vuelvan a tocarse de forma relevante.

## Reglas de trabajo en paralelo

Para bajar el riesgo de conflictos:

- una persona puede tocar shell, navegación o i18n,
- otra puede trabajar dentro de una carpeta `features/<feature>/`,
- otra puede trabajar en backend modular del dashboard,
- evitar que varias personas modifiquen al mismo tiempo un archivo grande con responsabilidades mezcladas.

## Relación con backend dashboard

Esta arquitectura frontend se complementa con una regla backend ya vigente:

- el backend live del dashboard debe vivir en el router modular,
- `apps/api/src/routes/dashboard.ts` no debe volver a convertirse en la fuente principal de comportamiento live.

## Checklist de mantenimiento

Antes de dejar un cambio grande en dashboard:

1. confirmar si la lógica nueva pertenece al shell o a un feature,
2. si pertenece a un feature, moverla a `src/features/<feature>/` cuando sea razonable,
3. evitar crecer `App.tsx` con lógica de negocio nueva,
4. evitar convertir `shared/` en un contenedor genérico,
5. verificar que la documentación no contradiga esta guía,
6. correr:

```bash
corepack pnpm --filter @42day/dashboard build
corepack pnpm --filter @42day/api build
```

## Relación con documentos de planning

Los documentos en `docs/planning/*` son útiles para contexto histórico, decisiones de producto y planes de ejecución.

Pero no son la fuente normativa de arquitectura frontend.

Si alguno menciona estructuras más viejas o una distribución anterior de responsabilidades, debe interpretarse como contexto histórico. La referencia vigente sigue siendo este documento.
