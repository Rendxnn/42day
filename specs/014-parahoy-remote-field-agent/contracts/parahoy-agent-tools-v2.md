# Contrato MCP: herramientas ParaHoy v2

## Transporte

- Endpoint HTTPS: `POST /mcp` en el Worker del ambiente.
- MCP protocol version: `2025-06-18`.
- Transporte Streamable HTTP stateless; no se emite `Mcp-Session-Id`.
- Métodos soportados: `initialize`, `notifications/initialized`, `tools/list`, `tools/call`.
- `notifications/initialized` responde `202` sin body.
- `GET /mcp` y `DELETE /mcp` responden `405` en modo stateless.
- Body máximo 256 KiB; JSON inválido o método desconocido usa error JSON-RPC.
- Toda respuesta de tool incluye `content` de texto JSON y `structuredContent` equivalente.
- Toda llamada, incluido `tools/list`, exige bearer OAuth válido. Un `401` incluye `WWW-Authenticate` con
  `resource_metadata`.

Las anotaciones de una herramienta informan al cliente; la autorización y confirmación se validan de nuevo en
el servidor.

## Tipos comunes

```ts
type Environment = "staging" | "production";

type Evidence = {
  sourceUrl: string;
  supports: Array<"identity" | "location" | "link" | "image" | "appearance">;
  confidence: "confirmed" | "inferred" | "unverified";
  note?: string; // 0..240
};

type RemoteAvatarCandidate = {
  sourceUrl: string; // HTTPS público, <= 2048; se reenvía al commit
  altText: string;   // 1..160
};

type Appearance = {
  pageBackgroundColor: string;
  cardBackgroundColor: string;
  textColor: string;
  iconColor: string;
  iconMode: "brand" | "monochrome";
};

type ProfileLinkInput = {
  kind: "menu" | "google_review" | "instagram" | "tiktok" |
        "website" | "whatsapp" | "phone" | "facebook" |
        "maps" | "survey" | "custom";
  label?: string;
  href: string;
  enabled: boolean;
};

type PreparationEnvelope = {
  preparationId: string;
  preparationToken: string;
  expiresAt: string;
  environment: Environment;
  warnings: string[];
  evidence: Evidence[];
  changes: Array<{ field: string; current: unknown; proposed: unknown }>;
};
```

Límites: máximo 30 links y 20 evidencias. Los arrays extra, campos desconocidos y enums desconocidos se
rechazan; no se ignoran silenciosamente.

## Herramientas de lectura

### `parahoy_get_connected_account`

Anotaciones: `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`.

```ts
input: {}
output: {
  userId: string;
  email?: string;
  role: "system_admin";
  clientId: string;
  environment: Environment;
  serverVersion: string;
  capabilities: {
    businessSetupV2: true;
    businessProfileUpdateV2: true;
    appearance: true;
    remoteAvatarImport: true;
  };
}
```

### `parahoy_list_business_profiles`

Conserva el contrato paginado de feature 009. Anotaciones de lectura. Máximo 100 por página.

### `parahoy_get_business_profile`

```ts
input: { profileId: string }
output: {
  profile: BusinessProfile; // incluye appearance y avatar de feature 013
  activeQrCount: number;
}
```

No expone storage path, hashes ni URLs firmadas.

### `parahoy_get_dynamic_link_unit`

Nueva lectura exacta para evitar depender del resultado embebido de prepare.

```ts
input: { code: string }
output: {
  unit: {
    id: string;
    code: string;
    label: string;
    status: "available" | "active" | "suspended" | "archived";
    revision: number;
    publicUrl: string;
    destinationType?: string;
    destinationUrl?: string;
    profileId?: string;
    nfcLockedAt?: string;
  };
}
```

`nfcLockedAt` es informativo; no impide cambiar destino porque la URL permanente no cambia.

## Preparar creación/asignación

### `parahoy_prepare_business_setup`

Anotaciones: preparación sin mutación pública, `readOnlyHint: true`, `destructiveHint: false`,
`openWorldHint: true`, porque el resolver Google Reviews puede consultar un redirect HTTPS externo al servidor
ParaHoy. El avatar no se descarga durante prepare.

```ts
input: {
  business: {
    displayName: string;
    headline?: string;
    locationName?: string;
    address?: string;
    links: ProfileLinkInput[];
    appearance?: Appearance; // defaults de feature 013 si se omite
    avatar?: RemoteAvatarCandidate;
  };
  qrCode: string;
  evidence: Evidence[];
}

output: PreparationEnvelope & {
  normalizedProposal: {
    displayName: string;
    slug: string;
    headline?: string;
    locationName?: string;
    address?: string;
    links: BusinessProfileLink[];
    appearance: Appearance;
    avatar?: { sourceOrigin: string; sourceHash: string; altText: string };
  };
  qr: {
    id: string;
    code: string;
    label: string;
    revision: number;
    status: string;
    publicUrl: string;
    currentDestination?: string;
  };
  matchingProfiles: Array<{
    id: string;
    displayName: string;
    slug: string;
    revision: number;
    status: string;
  }>;
  requiresActiveQrConsent: boolean;
  requiresImageRightsConfirmation: boolean;
}
```

El servidor normaliza campos, ordena links según reglas canónicas, valida apariencia/contraste, prepara Google
Reviews y detecta coincidencias. No descarga `avatar.sourceUrl`. Como esta operación crea y publica en el
commit, una paleta de bajo contraste se rechaza con `business_profile_contrast_invalid`; el agente la corrige y
vuelve a preparar.

## Confirmar creación/asignación

### `parahoy_commit_business_setup`

Anotaciones: `readOnlyHint: false`, `destructiveHint: true`, `openWorldHint: true`. Es una herramienta con
capacidad opcional de importar imagen desde una URL externa; la anotación es estática aunque una invocación
concreta no incluya imagen.

```ts
input: {
  preparationId: string;
  preparationToken: string;
  operationId: string;
  confirmed: true;
  duplicateDecision: "create_new" | { reuseProfileId: string };
  activeQrConsent?: true;
  imageSourceUrl?: string;       // obligatorio y exacto si prepare incluyó avatar
  imageRightsConfirmed?: true;  // obligatorio si prepare incluyó avatar
}

output: {
  operationId: string;
  replayed: boolean;
  environment: Environment;
  profile: {
    id: string;
    slug: string;
    publicUrl: string;
    status: "published";
    revision: number;
    avatarUrl?: string;
  };
  qr: {
    id: string;
    code: string;
    publicUrl: string;
    revision: number;
  };
}
```

Reglas:

- `reuseProfileId` debe pertenecer a `matchingProfiles`; en ese caso no modifica ese perfil ni importa avatar.
- `imageSourceUrl` se hashea y debe coincidir con `sourceHash`; no se acepta una URL equivalente distinta.
- Con importación, un resultado temporal `agent_asset_import_in_progress` incluye `retryAfterSeconds` pero no
  autoriza crear otro `operationId`.
- El mismo `operationId`/comando devuelve `replayed: true`; payload distinto devuelve
  `business_agent_operation_reuse`.

## Preparar actualización

### `parahoy_prepare_business_profile_update`

Anotaciones de preparación sin efectos públicos.

```ts
input: {
  profileId: string;
  patch: {
    displayName?: string;
    headline?: string | null;
    locationName?: string | null;
    address?: string | null;
    links?: ProfileLinkInput[]; // presencia = reemplazo completo
    appearance?: Partial<Appearance>;
    avatar?:
      | { action: "keep" }
      | { action: "remove" }
      | ({ action: "import" } & RemoteAvatarCandidate);
  };
  evidence: Evidence[];
}

output: PreparationEnvelope & {
  profile: {
    id: string;
    slug: string;
    status: "draft" | "published" | "disabled";
    revision: number;
    activeQrCount: number;
    publicUrl?: string;
  };
  normalizedFinalProfile: BusinessProfile;
  requiresPublishedProfileConsent: boolean;
  requiresImageRightsConfirmation: boolean;
}
```

Al menos un campo efectivo debe cambiar. `slug`, `tenantId`, `status`, IDs de assets y revisión no son editables
por input. Un perfil `disabled` se puede consultar pero esta herramienta no lo reactiva ni publica. Una paleta
de bajo contraste se permite con warning solo cuando el perfil seguirá en `draft`; para un perfil `published`
se rechaza durante prepare.

## Confirmar actualización

### `parahoy_commit_business_profile_update`

```ts
input: {
  preparationId: string;
  preparationToken: string;
  operationId: string;
  confirmed: true;
  publishedProfileConsent?: true;
  imageSourceUrl?: string;
  imageRightsConfirmed?: true;
}

output: {
  operationId: string;
  replayed: boolean;
  environment: Environment;
  profile: {
    id: string;
    slug: string;
    publicUrl?: string;
    status: string;
    revision: number;
    avatarUrl?: string;
  };
  activeQrCount: number;
}
```

Una actualización publicada conserva `status=published`; no cambia QRs individualmente porque apuntan al
perfil canónico. Revisión o estado distinto al preparado produce `business_profile_stale` sin reintento.

## Errores estables nuevos

| Código | Significado |
| --- | --- |
| `business_agent_environment_mismatch` | Plugin/token/operación cruzó ambiente. |
| `business_agent_preparation_invalid` | ID/token no existe o no coincide. |
| `business_agent_preparation_expired` | Superó diez minutos. |
| `business_agent_preparation_used` | Ya no está en estado confirmable. |
| `business_agent_operation_reuse` | `operationId` usado con otro comando/actor/cliente. |
| `business_agent_confirmation_required` | Falta `confirmed: true`. |
| `business_agent_active_qr_consent_required` | QR activo sin consentimiento. |
| `business_agent_published_profile_consent_required` | Perfil publicado sin consentimiento. |
| `business_agent_image_rights_required` | Falta confirmación de derecho de uso. |
| `business_agent_image_source_mismatch` | URL no coincide con la preparada. |
| `business_agent_image_source_forbidden` | URL/redirect/DNS no es público y seguro. |
| `business_agent_image_download_failed` | Timeout, status o transporte inválido. |
| `business_agent_asset_import_in_progress` | Otra llamada tiene lease vigente. |
| `business_agent_rate_limited` | Límite por actor+cliente excedido. |

Todos se traducen a un mensaje español controlado y, cuando aplica, `field`/`retryAfterSeconds`. Nunca incluyen
stack, respuesta remota, IP resuelta, token, URL completa ni query string.
