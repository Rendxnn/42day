# Modelo de datos: perfiles ligeros de negocio

## `control.business_profiles`

| Campo | Regla |
| --- | --- |
| `id` | UUID opaco. |
| `slug` | Único, minúsculas y guiones; inmutable después de publicar. |
| `tenant_id` | Nullable y único; FK `ON DELETE RESTRICT` a `control.tenants`. |
| `display_name` | Requerido, 1–160 caracteres. |
| `headline`, `location_name`, `address` | Opcionales y acotados. |
| `status` | `draft`, `published` o `disabled`. |
| `revision` | Entero positivo para edición optimista. |
| `creation_request_id` | UUID opcional único para reintentos de creación; los perfiles backfilled pueden no tenerlo. |
| `created_by`, `published_at`, timestamps | Auditoría mínima de ciclo de vida. |

Transiciones permitidas: `draft → published`, `draft → disabled`, `published → disabled`. `disabled` es
terminal en este alcance.

## `control.business_profile_links`

| Campo | Regla |
| --- | --- |
| `profile_id` | FK restrictiva al perfil. |
| `kind` | `menu`, `google_review`, `instagram`, `tiktok`, `website`, `whatsapp`, `phone`, `facebook`, `maps`, `survey` o `custom`. |
| `label`, `href` | Etiqueta opcional; valor normalizado y validado según tipo. |
| `enabled` | Solo enlaces `true` llegan a la proyección pública. |
| `sort_order` | Determina orden estable; los tipos estándar tienen orden inicial fijo. |

Se permite más de un `custom`; los tipos estándar solo tienen una entrada por perfil. Guardar un valor no
activa su visibilidad.

## Relaciones con modelos existentes

```text
control.tenants 0..1 ── 1 control.business_profiles
control.business_profiles 1 ── * control.business_profile_links
control.business_profiles 0..1 ── * control.dynamic_link_units
control.dynamic_link_units 1 ── * control.dynamic_link_audit_events
```

Una unidad con `destination_type = 'profile'` exige `profile_id`. El backend deriva su URL pública y
mantiene la URL física de la unidad. Un perfil con tenant adopta su tenant/sede válida; un perfil genérico
limpia cualquier asociación de tenant/sede de la unidad.

## Backfill y dual-write

El backfill solo crea perfiles faltantes para tenants con primera sede activa. Copia campos disponibles y
crea enlaces deshabilitados para valores legacy existentes. El rollout mantiene las columnas legacy y el
perfil canónico en la misma transacción de edición hasta que exista una migración de retiro aprobada.
