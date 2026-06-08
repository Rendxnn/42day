# Estado y adopcion futura de t-router

Ultima actualizacion: 2026-06-07.

## Estado actual

Hoy `t-router` ya vive vendorizado dentro del monorepo en `packages/t-router`.

42day lo usa para:

- parser semantico de pedidos libres,
- soporte actual de Gemini como proveedor inicial.

Este estado es suficiente para el objetivo `demo-ready`. No bloquea demos ni pruebas con clientes.

## Decision vigente

- mantener `t-router` dentro del workspace por ahora,
- evitar que su externalizacion distraiga el cierre del flujo principal,
- tratar la publicacion remota como mejora de mantenimiento, no como trabajo critico del producto demo-ready.

## Que si resuelve hoy

- adapters por proveedor,
- router generico,
- task `object`,
- normalizacion de errores,
- structured output para el parser semantico.

## Que no debe absorber

- prompts de 42day,
- schemas de negocio de 42day,
- reglas de matching del menu,
- politicas de handoff,
- decisiones operativas del flujo conversacional.

## Estado deseado despues de demos

Cuando el flujo principal ya este estable, `t-router` puede salir a dependencia remota para:

- facilitar colaboracion entre maquinas y proyectos,
- versionar adapters por proveedor,
- reutilizar el router sin duplicar codigo.

## Condiciones para externalizarlo bien

- repo publico o accesible,
- package name estable,
- tags/versiones,
- README y ejemplos,
- compatibilidad cuidada entre versiones.

## No es prioritario ahora porque

- el costo tecnico de mantenerlo vendorizado hoy es bajo,
- el beneficio comercial inmediato esta en cerrar el flujo principal del producto,
- la externalizacion no arregla ninguno de los gaps demo-ready mas importantes.
