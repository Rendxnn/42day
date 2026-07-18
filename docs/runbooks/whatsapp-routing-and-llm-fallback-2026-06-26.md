# WhatsApp routing y fallback LLM

Fecha de referencia: `2026-06-26`.

> Guia operativa actualizada: desde `2026-07-18`, todo inbound textual procesable se interpreta mediante un plan semántico ID-based. Las ramas de media/ubicación/manual y las validaciones de negocio siguen siendo determinísticas; no hay detección determinística de intención del cliente.

## Estado validado

### Routing del numero nuevo

- El `phone_number_id` `1169106939625414` ya no apunta a `thaledon`.
- Hoy apunta a `tenant_demo` mediante `control.tenant_channels`.
- Motivo del cambio:
  - `tenant_thaledon` si tiene `locations`,
  - pero no tiene `menus` publicados,
  - ni `menu_items`,
  - ni `products`,
  - por lo tanto el bot respondia correctamente que no habia menu publicado.

### Tenant con menu util para pruebas

En la revision operativa del `2026-06-26`, el unico tenant con menu publicado para `2026-06-25` y con items reales fue:

- `tenant_demo`
- tenant: `Restaurante Demo`
- `16` `menu_items` publicados para ese dia

No se encontro un tenant con menu util para `2026-06-24`.

## Estado del fallback LLM

### Problema encontrado

Cuando Gemini devolvia errores como:

- alta demanda,
- cuota,
- indisponibilidad temporal,
- timeout,
- error de red,

el backend registraba `semantic_parser.skipped_or_failed`, pero no intentaba `OpenRouter`.

### Causa real

El fallback existia solo de forma parcial:

- `t-router` ya incluia `OpenRouterAdapter`,
- los tipos ya contemplaban `openrouter`,
- pero el backend solo cargaba configuracion `gemini`,
- y el parser semantico solo registraba `GeminiAdapter`.

## Cambio aplicado en codigo

Quedo implementado:

- soporte de `OPENROUTER_API_KEY` y `OPENROUTER_MODEL` en env/bindings,
- carga de proveedor `openrouter` desde backend,
- fallback real `gemini -> openrouter` cuando el intento primario no puede completar el plan semántico,
- trazabilidad segura de proveedor, modelo, duración, código HTTP y estado upstream, sin cuerpo de respuesta ni texto del cliente,
- log `semantic_operation_plan.completed` con proveedor, fallback, tipos de operación y conteo,
- log `semantic_operation_plan.failed` con intentos seguros y alerta técnica deduplicada cuando ambos proveedores fallan,
- metadata `routing.llm` con resultado y diagnósticos seguros; no se persisten dirección completa, billing ni mensaje libre.

## Pendiente operativo

Para que el fallback corra realmente en `staging`, todavia falta:

```bash
bash scripts/bash/set-cf-worker-secret.sh OPENROUTER_API_KEY --environment staging
bash scripts/bash/deploy-api.sh --environment staging
```

Opcionalmente puede fijarse modelo:

```bash
bash scripts/bash/set-cf-worker-secret.sh OPENROUTER_MODEL --environment staging
```

Aunque por defecto el runtime ya quedo con:

```txt
OPENROUTER_MODEL=openrouter/auto
```

## Lectura rapida

Si el numero nuevo vuelve a fallar por menu:

1. revisar `control.tenant_channels`,
2. confirmar a que `tenant_id` apunta el `phone_number_id`,
3. revisar `locations`, `menus` y `menu_items` dentro del schema de ese tenant,
4. no asumir que el problema es de webhook si el tenant resuelve bien.
