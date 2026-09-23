# Contrato: herramientas ParaHoy para agente

## Transporte y autenticación

- MCP HTTPS en `/mcp` del Worker.
- OAuth 2.1 Authorization Code + PKCE mediante Supabase Auth.
- Protected Resource Metadata referencia el authorization server.
- Cada request valida JWT/JWKS, issuer, audience, expiración, `client_id` permitido y `system_admin`.
- Staging y producción usan clientes/redirect URIs distintos.
- Las anotaciones MCP comunican riesgo, pero no reemplazan autorización/confirmación.

## `parahoy_get_connected_account`

Lectura: `{}` → `{ userId, role: "system_admin", clientId, environment }`. No devuelve tokens ni claims.

## `parahoy_list_business_profiles`

Lectura. Usa el contrato paginado del dashboard: query, status, association, sort, direction,
pageSize y cursor; devuelve `BusinessProfilePage`.

## `parahoy_get_business_profile`

Lectura por ID estable. Devuelve perfil, enlaces, revisión y uso por QRs.

## `parahoy_prepare_business_setup`

Preparación sin efectos públicos.

```ts
input: {
  business: {
    displayName: string;
    locationName?: string;
    address?: string;
    headline?: string;
    links: Array<{
      kind: "menu" | "google_review" | "instagram" | "tiktok" |
            "website" | "whatsapp" | "phone" | "facebook" |
            "maps" | "survey" | "custom";
      label?: string;
      href: string;
      enabled: boolean;
    }>;
  };
  qrCode: string;
}
output: {
  preparationId: string;
  preparationToken: string;
  expiresAt: string;
  normalizedProposal: object;
  qr: { id: string; code: string; revision: number; status: string; publicUrl: string };
  matchingProfiles: Array<{ id: string; displayName: string; slug: string; revision: number }>;
  warnings: string[];
  changes: Array<{ field: string; current: unknown; proposed: unknown }>;
  requiresActiveQrConsent: boolean;
}
```

El servidor normaliza HTTPS/teléfono/WhatsApp, prepara Google Reviews con el resolver existente,
detecta coincidencias y lee el QR exacto. No visita internet ni crea datos.

## `parahoy_commit_business_setup`

Escritura consecuencial. El agente debe mostrar la propuesta y obtener confirmación inmediatamente
antes de invocarla.

```ts
input: {
  preparationId: string;
  operationId: string;
  preparationToken: string;
  confirmed: true;
  activeQrConsent?: true;
  duplicateDecision: "create_new" | { reuseProfileId: string };
}
output: {
  operationId: string;
  replayed: boolean;
  profile: { id: string; slug: string; publicUrl: string; status: "published" };
  qr: { id: string; code: string; publicUrl: string; revision: number };
}
```

El token pertenece a actor/cliente, vence en diez minutos y fija el payload por hash. Coincidencias y
QR activo requieren decisiones explícitas. La operación es todo-o-nada e idempotente, conserva la
URL del QR y no permite eliminar/deshabilitar en v1. `reuseProfileId` solo asigna el perfil existente
al QR: nunca modifica los campos o links de ese perfil.
