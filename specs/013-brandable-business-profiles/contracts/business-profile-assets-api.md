# Contrato API: assets de perfiles

## Carga administrativa

### `POST /dashboard/admin/business-profile-assets`

- `system_admin`.
- `multipart/form-data` con `file` y `altText`.
- Content-Length máximo 3.25 MB para tolerar multipart; contenido máximo 3 MB.
- Imagen entre 64 y 4096 px por lado, máximo 16 megapíxeles y sin EXIF/GPS/XMP/chunks textuales.
- Respuesta `201`:

```ts
{
  asset: {
    id: string;
    status: "staged";
    previewUrl: string;
    altText: string;
    expiresAt: string;
  }
}
```

`previewUrl` apunta al endpoint autenticado común y no es una URL firmada persistente. Expira con el asset.

## Carga de encargado

### `POST /dashboard/:tenantSlug/settings/public-profile/avatar`

Mismo multipart y límites. Requiere membresía `encargado` activa y solo permite asociar el asset al perfil
canónico del tenant al guardar settings.

## Lectura de preview autenticada común

### `GET /dashboard/business-profile-assets/:id/preview`

Sirve `staged|active`, `Content-Type` validado, `nosniff` y cache privado. Autoriza si el actor es
`system_admin`, creó el asset o administra el tenant cuyo perfil canónico lo referencia. La respuesta 404 no
distingue inexistencia de falta de acceso. No existe una ruta paralela bajo `/admin`.

## Lectura pública

### `GET /dashboard/public/business-profile-assets/:id`

Solo sirve un asset `active` referenciado por al menos un perfil `published`. Respuestas:

- `200`, `Content-Type`, `ETag`, `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`;
- `304` si `If-None-Match` coincide;
- `404` indistinguible para staged, huérfano, inexistente o no referenciado.

## Borrado

No existe endpoint público/admin de borrado en esta feature. Cambiar avatar deja el asset anterior sin nueva
referencia; mantenimiento posterior puede marcarlo huérfano, pero nunca borra uno todavía referenciado.

## Límite de carga

Ambas rutas de carga comparten un límite persistente de 30 intentos por hora por actor. Al excederlo responden
`429 business_profile_asset_rate_limited`, mensaje español controlado y `Retry-After`; un reinicio del Worker
no reinicia el conteo.
