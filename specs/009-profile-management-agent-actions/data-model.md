# Modelo de datos

## `BusinessProfileSummary`

Proyección de lectura, no tabla: identidad y revisión (`id`, `creationRequestId?`, `slug`, `displayName`,
`headline?`, `locationName?`, `address?`, `status`, `tenantId?`, `publishedAt?`, `createdAt`, `updatedAt`),
además de `association: linked|generic` y `activeQrCount`. El conteo se resuelve en una consulta
agregada, nunca N+1.

## `BusinessProfilePage`

`profiles`, `totalCount` y `pageInfo { hasNext, nextCursor? }`. El cursor no se persiste: es JSON
versionado codificado en base64url con huella de parámetros, último valor ordenado e `id`. El servidor
valida esquema, versión y huella; nunca se interpreta en el cliente ni contiene secretos.

## `control.business_setup_operations`

| Campo | Tipo | Regla |
| --- | --- | --- |
| `id` | uuid | PK; identidad de propuesta. |
| `preparation_token_hash` | text | Único; el token crudo se entrega una vez. |
| `actor_user_id` | uuid | Usuario Supabase preparador. |
| `oauth_client_id` | text | Cliente MCP autorizado. |
| `state` | text | `prepared`, `committed`, `expired`, `failed`. |
| `command_hash` | text | Hash canónico de target/consentimiento. |
| `proposal` | jsonb | Candidatos, advertencias e IDs; sin secretos. |
| `qr_unit_id` | uuid | FK a unidad QR. |
| `expected_qr_revision` | integer | Revisión observada. |
| `matching_profile_id` | uuid nullable | Coincidencia, si existe. |
| `expected_profile_revision` | integer nullable | Revisión de coincidencia. |
| `operation_id` | uuid nullable | Único al confirmar; idempotencia. |
| `result` | jsonb nullable | IDs y URLs estables del commit. |
| `expires_at` | timestamptz | Diez minutos desde prepare. |
| `committed_at` | timestamptz nullable | Commit exitoso. |
| `created_at`, `updated_at` | timestamptz | Tiempos internos. |

Seguridad: RLS habilitado y forzado, grants revocados a `anon/authenticated`, acceso solo backend,
FKs `ON DELETE RESTRICT`, token crudo nunca persistido ni logueado.

```text
prepared --commit válido--> committed
prepared --vence---------> expired
prepared --fallo terminal> failed
committed --mismo comando> committed (devuelve result)
```

Otro actor/cliente no canjea la propuesta. El mismo `operation_id` con hash diferente falla.

## Funciones

### `control.list_business_profiles_page`

Entrada allowlisted; salida resumen + total + cursor. `SECURITY INVOKER`, `search_path = ''`, nombres
calificados y orden estable por campo + `id`.

### `control.commit_business_setup`

Bloquea operación, QR y coincidencia en orden estable; revalida vencimiento, actor/cliente,
revisiones y estado; crea o reutiliza explícitamente el perfil, publica, asigna el QR sin cambiar su
URL permanente y audita. Guarda resultado/estado en la misma transacción. Cualquier error revierte
todo.

## Índices candidatos

- `(updated_at DESC, id DESC)`, `(created_at DESC, id DESC)`.
- `(status, updated_at DESC, id DESC)`.
- `lower(display_name)` y `slug` solo según `EXPLAIN`.
- operaciones por `(actor_user_id, created_at DESC)`.
- únicos en `preparation_token_hash` y `operation_id` no nulo.

`pg_trgm` solo se incluye si la carga de 10 000 filas demuestra necesidad.
