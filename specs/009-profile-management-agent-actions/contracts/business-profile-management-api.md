# Contrato: inventario y administración de perfiles

Todas las rutas requieren bearer de `system_admin` y se sirven bajo `/dashboard`.

## `GET /admin/business-profiles`

| Query | Valores | Default |
| --- | --- | --- |
| `query` | texto, máximo 120 | vacío |
| `status` | `draft`, `published`, `disabled` | todos |
| `association` | `linked`, `generic` | todas |
| `sort` | `updatedAt`, `createdAt`, `displayName`, `slug`, `status` | `updatedAt` |
| `direction` | `asc`, `desc` | `desc` |
| `pageSize` | `25`, `50`, `100` | `25` |
| `cursor` | opaco emitido por la misma consulta | ausente |

Un cursor usado con otros parámetros devuelve `400 invalid_profile_cursor`.

```ts
type BusinessProfilePage = {
  profiles: Array<{
    id: string;
    slug: string;
    displayName: string;
    locationName?: string;
    status: "draft" | "published" | "disabled";
    tenantId?: string;
    association: "linked" | "generic";
    activeQrCount: number;
    createdAt: string;
    updatedAt: string;
  }>;
  totalCount: number;
  pageInfo: { hasNext: boolean; nextCursor?: string };
};
```

Errores: `400 invalid_profile_filters`, `400 invalid_profile_cursor`, `401 unauthorized`,
`403 system_admin_required`.

## `GET /admin/business-profiles/:id`

Conserva `BusinessProfileResponse`; cuando se solicita el detalle fresco incluye tanto el campo
compatibilidad `activeQrCount` como `usage: { activeQrCount: number }`.

## Mutaciones preservadas

- `POST /admin/business-profiles`
- `PATCH /admin/business-profiles/:id`
- `POST /admin/business-profiles/:id/publish`
- `POST /admin/business-profiles/:id/disable-and-suspend`

No se añade `DELETE`. La UI etiqueta la última como `Deshabilitar perfil`, muestra impacto desde un
detalle fresco y envía la revisión esperada. Un `409` no se reintenta automáticamente.
