# Plan de adopcion de t-router

Ultima actualizacion: 2026-04-27.

## Decision

El router generico vivira como proyecto aparte.

Nombre decidido:

```txt
t-router
```

Objetivo:

- reutilizar adapters y router entre varios proyectos,
- evitar duplicar integraciones con proveedores,
- mantener el negocio fuera del router.

## Estado deseado

42day debe consumir `t-router` como dependencia remota desde GitHub.

## Pregunta clave: que le toca hacer a otro desarrollador

Si `t-router` se publica en un repositorio publico y 42day lo referencia como dependencia GitHub:

- tu amigo **no** tiene que clonar manualmente `t-router`,
- solo clona `42day`,
- corre `pnpm install`,
- y el package manager descarga la dependencia automaticamente.

Esto es precisamente una de las ventajas de volverlo dependencia real.

## Recomendacion de consumo

Usar dependencia GitHub publica.

Ejemplo conceptual:

```json
{
  "dependencies": {
    "@rendxnn/t-router": "github:Rendxnn/t-router#v0.1.0"
  }
}
```

Se recomienda usar tags y no solo `main`.

## Que implica volverlo dependencia

Implica:

- versionarlo,
- cuidar compatibilidad,
- documentar contrato,
- evitar cambios rompientes sin control,
- publicar cambios cuando 42day los necesite.

## Ventajas reales

- instalacion automatica para cualquier colaborador,
- reuso entre proyectos,
- una sola base para adapters por proveedor,
- actualizacion controlada por version/tag.

## Costos reales

- requiere disciplina de versionado,
- si cambias APIs internas del router, debes actualizar consumidores,
- necesita README y ejemplos claros.

## Recomendacion sobre el repositorio

### Si

- repo publico en GitHub
- package name estable
- tags por version

### No

- dependencia `file:../t-router` para trabajo colaborativo normal

Esa opcion local sirve solo temporalmente para una sola maquina.

## Alcance del router

El router debe contener:

- adapters por proveedor
- normalizacion de errores
- router y factory
- helpers HTTP
- soporte para tasks `text` y `object`
- structured output
- soporte multimodal generico

## Lo que no debe contener

- prompts de 42day
- schemas de pedidos de 42day
- logica de negocio de 42day
- reglas de matching de menu
- politicas de fallback del producto

## Primer proveedor

Decision:

- Gemini primero

## Primer modo de autenticacion

Decision:

- un solo provider activo por tenant
- auth inicial por API key

## Donde vivirian las credenciales en 42day

Decision:

- guardar metadata del provider por tenant en DB,
- guardar secretos cifrados a nivel aplicacion,
- usar clave maestra del cifrado como secret del backend.

## Recomendacion de tabla en 42day

```txt
control.tenant_ai_provider_configs
  tenant_id
  provider_id
  auth_mode
  encrypted_api_key
  encrypted_access_token
  default_model
  provider_extra
  status
  created_at
  updated_at
```

## Casos de uso iniciales de 42day

Por ahora solo:

1. `semantic_order_parse`
2. `menu_ingestion`

## Plan de implementacion de t-router

### Fase 1. Repo y empaquetado

1. inicializar repo git de `t-router`
2. crear README
3. definir package name final
4. subir a GitHub publico
5. crear primer tag

### Fase 2. Adapter Gemini

1. auth por API key
2. soporte `text`
3. soporte `object`
4. structured output
5. normalizacion de errores
6. timeout
7. tests

### Fase 3. Integracion con 42day

1. agregar dependencia GitHub
2. instalar
3. crear servicio `semantic_parser`
4. crear servicio `menu_ingestion`
5. leer provider activo por tenant

## Que queda pendiente antes de implementarlo

1. nombre final del package npm
2. URL real del repo GitHub: `https://github.com/Rendxnn/t-router`
3. version inicial/tag
4. detalle exacto del cifrado app-level en 42day

## Recomendacion final

Si el objetivo es reutilizarlo en varios proyectos y que otros devs lo consuman facil, si vale la pena dejarlo como dependencia desde el principio.

La condicion es hacerlo como repo publico o accesible y no como carpeta local.
