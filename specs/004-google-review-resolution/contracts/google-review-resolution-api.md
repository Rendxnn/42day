# Contrato API: preparación de destino de reseña

## Resolver destino

`POST /dashboard/admin/dynamic-links/google-review/resolve`

Requiere sesión `system_admin`.

```json
{
  "destinationUrl": "https://maps.app.goo.gl/47m3mUCvBw2YqmKU7"
}
```

Response `200`:

```json
{
  "resolution": {
    "sourceKind": "maps_short_link",
    "reviewUrl": "https://www.google.com/maps/place//data=!4m3!3m2!1s0x0000:0x0000!12e1",
    "candidateLabel": "Nombre orientativo",
    "confirmationRequired": true
  }
}
```

`candidateLabel` se omite cuando no hay slug legible.

## Errores

| HTTP | `error` |
| --- | --- |
| 400 | `google_review_url_invalid` |
| 400 | `google_review_url_unsupported` |
| 422 | `google_review_identifier_missing` |
| 422 | `google_review_identifier_ambiguous` |
| 502 | `google_review_redirect_invalid` |
| 502 | `google_review_upstream_failed` |
| 504 | `google_review_resolution_timeout` |

El formato de error existente es `{ "error": "code" }`.

## Mutaciones existentes

`PATCH /dashboard/admin/dynamic-links/:id/quick-configuration` y `PATCH /dashboard/admin/dynamic-links/:id` conservan sus cuerpos. Un destino Google nuevo short/business devuelve `400` con `dynamic_link_google_review_resolution_required`. Una URL legacy idéntica a la persistida puede conservarse al actualizar otros campos.
