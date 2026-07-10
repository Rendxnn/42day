# WhatsApp routing y fallback LLM

Fecha de referencia: `2026-06-26`.

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
- fallback real `gemini -> openrouter` para:
  - `provider_quota_exceeded`,
  - `provider_unavailable`,
  - `provider_timeout`,
  - `provider_network_error`,
- trazabilidad de proveedor usado en metadata de routing,
- log `semantic_parser.completed` con `provider` y `fallbackFromProviderId`,
- snapshot de `parsed` dentro de `routing.llm`.

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
