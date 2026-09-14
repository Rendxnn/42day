# Modelo de datos

## Persistencia

Este feature no añade tablas, columnas ni migraciones. Reutiliza `control.dynamic_link_units` y sus campos `destination_type` y `destination_url`.

## Estado efímero: candidato de reseña

| Campo | Tipo | Regla |
| --- | --- | --- |
| `sourceKind` | enum | `maps_short_link`, `maps_business_url` o `direct_review_url` |
| `reviewUrl` | URL HTTPS | Enlace directo reconocido que pasa validación general |
| `candidateLabel` | string opcional | Referencia visual del slug; no autoritativa |
| `confirmationRequired` | literal `true` | Nunca es guardable sin interacción |

## Estado efímero: preparación UI

- `idle`: no hay resolución vigente.
- `resolving`: entrada congelada mientras se consulta.
- `resolved`: candidato disponible y registro de preview abierto.
- `confirmed`: candidato abierto y aprobado para esa entrada.
- `failed`: entrada conservada y error recuperable.

```text
idle -> resolving -> resolved -> confirmed
                   -> failed
resolved -> idle (edición o rechazo)
confirmed -> idle (edición)
failed -> resolving (reintento)
```

## Compatibilidad de unidad

- Nuevo `google_review`: exige URL directa.
- Destino legacy sin cambios: se conserva.
- Reemplazo de legacy: exige URL directa.
- URL permanente, asociación, estado, auditoría y revisión mantienen sus reglas actuales.
