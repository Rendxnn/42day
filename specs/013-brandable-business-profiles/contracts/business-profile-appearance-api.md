# Contrato API: apariencia de perfiles

## Tipos compartidos

```ts
type BusinessProfileIconMode = "brand" | "monochrome";

type BusinessProfileAppearance = {
  pageBackgroundColor: string;
  cardBackgroundColor: string;
  textColor: string;
  iconColor: string;
  iconMode: BusinessProfileIconMode;
};

type BusinessProfileAvatar = {
  assetId: string;
  url: string;
  altText: string;
};
```

`BusinessProfile`, `BusinessProfileSummary`, requests de creación/actualización y payload público incorporan
`appearance`; detalle/payload pueden incluir `avatar`.

## Administración

### `POST /dashboard/admin/business-profiles`

Extiende el body con:

```ts
appearance?: BusinessProfileAppearance;
avatarAssetId?: string | null;
```

Omitir apariencia usa defaults. El asset debe pertenecer al actor, estar `staged` y no estar vencido.

### `PATCH /dashboard/admin/business-profiles/:id`

Extiende el body total con `appearance` y `avatarAssetId`. Exige `revision`. Para un perfil publicado, el
backend rechaza contraste inválido con `409 business_profile_contrast_invalid` y `field: "appearance"`.

### Publicación

`POST /dashboard/admin/business-profiles/:id/publish` valida contraste e integridad del asset además de las
reglas existentes.

## Fachada de restaurante

`GET|PATCH /dashboard/:tenantSlug/settings/public-profile` incorpora `appearance` y `avatar`, conservando los
campos legacy. La autorización continúa basada en membresía del tenant, no en un ID aportado por cliente.

## Lectura pública

`GET /dashboard/public/business-profiles/:slug` devuelve:

```ts
{
  profile: { slug, displayName, headline?, locationName?, address? },
  appearance: BusinessProfileAppearance,
  avatar?: BusinessProfileAvatar,
  links: Array<{ kind, label?, href, sortOrder }>
}
```

Borrador/deshabilitado continúa como 404. No se devuelven storage path, hash, procedencia ni estado del asset.

## Errores nuevos

| Código | HTTP | Campo | Significado |
| --- | ---: | --- | --- |
| `business_profile_color_invalid` | 400 | color específico | Sintaxis distinta de hex de seis dígitos. |
| `business_profile_contrast_invalid` | 409 | `appearance` | Estado público no cumple contraste. |
| `business_profile_asset_not_found` | 404 | `avatar` | Asset inexistente o no visible al actor. |
| `business_profile_asset_invalid` | 400 | `avatar` | Estado/tipo/tamaño incompatible. |
| `business_profile_asset_stale` | 409 | `avatar` | Asset preparado vencido o ya consumido. |
| `business_profile_asset_rate_limited` | 429 | `avatar` | Superó 30 cargas por hora para el actor. |

Todos incluyen `{ error, message, field? }` y copy en español desde `@42day/types`.
