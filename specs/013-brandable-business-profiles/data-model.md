# Modelo de datos: perfiles públicos personalizables

## `control.business_profile_assets`

| Campo | Tipo/regla |
| --- | --- |
| `id` | UUID opaco, PK. |
| `status` | `staged`, `active` u `orphaned`. |
| `storage_path` | Ruta privada única; nunca URL firmada. |
| `mime_type` | `image/jpeg`, `image/png` o `image/webp`. |
| `byte_size` | Entero entre 1 y 3 145 728. |
| `width_px`, `height_px` | Enteros entre 64 y 4096; `width_px * height_px <= 16 000 000`. |
| `content_sha256` | 64 caracteres hex; índice para deduplicación opcional, no identidad pública. |
| `source_origin` | URL pública sanitizada sin query ni fragmento; nullable para carga manual. |
| `alt_text` | 1–160 caracteres. |
| `created_by` | UUID del actor. |
| `expires_at` | Requerido para `staged`; null para `active`. |
| `activated_at` | Timestamp al vincularse. |
| `created_at`, `updated_at` | Auditoría. |

RLS forzado; `public`, `anon` y `authenticated` sin acceso. `service_role` es el único rol de datos. El
objeto se escribe y elimina mediante Storage API, nunca modificando `storage.objects` directamente.

Transiciones:

```text
staged -> active
staged -> orphaned
orphaned -> eliminado por mantenimiento
active -> sin transición destructiva en este alcance
```

## Extensión de `control.business_profiles`

| Campo | Regla |
| --- | --- |
| `avatar_asset_id` | FK nullable `ON DELETE RESTRICT` a asset `active`. |
| `page_background_color` | Hex `^#[0-9A-F]{6}$`, default `#17110D`. |
| `card_background_color` | Hex, default `#FFFAF4`. |
| `text_color` | Hex, default `#261D18`. |
| `icon_color` | Hex, default `#D86227`. |
| `icon_mode` | `brand` o `monochrome`, default `monochrome`. |

La revisión aumenta cuando cualquiera cambia. Backfill usa defaults sin incrementar la revisión existente.

## Storage

Bucket privado `business-profile-assets`:

- límite 3 MB;
- MIME permitidos JPEG/PNG/WebP;
- dimensiones 64–4096 px por lado y máximo 16 megapíxeles;
- ruta `<asset-id>/<content-sha256>.<ext>`;
- sin policies para cliente;
- upload/download/delete solo mediante backend.

## Proyección pública

```text
BusinessProfilePayload
├── profile: identidad existente
├── appearance: cuatro colores + iconMode
├── avatar?: assetId + URL backend + altText
└── links: habilitados y ordenados
```

El endpoint de imagen verifica `status = active` y referencia vigente antes de descargar del bucket. Devuelve
`ETag` basado en hash y cache público inmutable para ese asset.

## RPC

- `control.create_business_profile_complete`: creación idempotente de draft con apariencia y asset staged
  opcional; activa el asset dentro de la misma transacción de datos.
- `control.update_business_profile_complete`: revisión optimista, identidad, links, apariencia y cambio de
  asset; bloquea contraste inválido para perfiles publicados.
- `control.publish_business_profile`: se amplía para validar contraste y asset activo.

Las RPC actuales permanecen como compatibilidad y delegan defaults. Todas son `security invoker`, tienen
`search_path = ''`, `EXECUTE` revocado de `public/anon/authenticated` y grant solo a `service_role`.
