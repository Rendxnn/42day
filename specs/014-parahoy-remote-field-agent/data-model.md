# Modelo de datos: operaciones remotas de agente v2

## `control.business_agent_operations`

Tabla nueva. La tabla `control.business_setup_operations` se conserva intacta para compatibilidad/rollback.

| Campo | Tipo/regla |
| --- | --- |
| `id` | UUID PK; `preparationId`. |
| `kind` | `setup` o `profile_update`. |
| `state` | `prepared`, `asset_pending`, `asset_ready`, `committed`, `expired`, `failed`. |
| `preparation_token_hash` | SHA-256 hex único; nunca el token crudo. |
| `operation_id` | UUID único nullable hasta el primer commit/claim. |
| `command_hash` | SHA-256 hex del comando de commit; nullable hasta claim. |
| `commit_attempted_at` | Timestamp del primer intento autenticado de commit; se fija una vez y sirve para rate limiting. |
| `actor_user_id` | Usuario Supabase que preparó. |
| `oauth_client_id` | Cliente allowlisted que preparó. |
| `environment` | `staging` o `production`; constraint y comparación al confirmar. |
| `proposal` | JSONB normalizado sin secretos ni URL completa de imagen. |
| `target_qr_unit_id` | FK restrict nullable; requerido para `setup`. |
| `expected_qr_revision` | Entero nullable; requerido para `setup`. |
| `target_profile_id` | FK restrict nullable; requerido para `profile_update`. |
| `expected_profile_revision` | Entero nullable; requerido para `profile_update`. |
| `image_source_hash` | SHA-256 de URL completa nullable. |
| `staged_asset_id` | FK restrict nullable a asset de feature 013. |
| `asset_lease_id` | UUID nullable, secreto efímero devuelto una vez al worker que reclama. |
| `asset_lease_until` | Timestamp nullable, máximo dos minutos. |
| `result` | JSONB de IDs/URLs estables, sin secrets. |
| `failure_code` | Código allowlisted nullable; no stack/detail. |
| `expires_at` | Diez minutos desde prepare. |
| `committed_at` | Timestamp nullable. |
| `created_at`, `updated_at` | Auditoría. |

Constraints por clase:

```text
kind=setup:
  target_qr_unit_id y expected_qr_revision requeridos

kind=profile_update:
  target_profile_id y expected_profile_revision requeridos

image_source_hash is null:
  staged_asset_id, asset_lease_id y asset_lease_until deben ser null
```

No se impone que `target_profile_id` sea null en setup: al confirmar una coincidencia existente, la decisión se
valida contra candidatos en `proposal`; la fila objetivo seleccionada se bloquea dentro de la RPC sin reescribir
la preparación.

## Forma de `proposal`

```ts
type AgentProposal = {
  version: 2;
  kind: "setup" | "profile_update";
  environment: "staging" | "production";
  finalProfile: {
    displayName: string;
    headline?: string;
    locationName?: string;
    address?: string;
    links: BusinessProfileLink[];
    appearance: BusinessProfileAppearance;
    avatarAction: "keep" | "remove" | "import";
    avatar?: {
      sourceHash: string;
      sourceOrigin: string;
      altText: string;
    };
  };
  qr?: {
    id: string;
    code: string;
    revision: number;
    status: DynamicLinkStatus;
    publicUrl: string;
    currentDestination?: string;
  };
  profile?: {
    id: string;
    revision: number;
    status: BusinessProfileStatus;
    activeQrCount: number;
  };
  matchingProfiles: Array<{
    id: string;
    displayName: string;
    slug: string;
    revision: number;
    status: BusinessProfileStatus;
  }>;
  evidence: Array<{
    sourceUrl: string;
    supports: Array<"identity" | "location" | "link" | "image" | "appearance">;
    confidence: "confirmed" | "inferred" | "unverified";
    note?: string;
  }>;
  warnings: string[];
  changes: Array<{ field: string; current: unknown; proposed: unknown }>;
};
```

`sourceUrl` de evidencia se sanitiza sin userinfo, query ni fragment. `avatar.sourceHash` cubre la URL completa
pero `sourceOrigin` conserva solo URL sanitizada. No se guarda contenido descargado en `proposal`.

## Estados y transiciones

```text
prepared ──commit sin imagen───────────────> committed
prepared ──claim de imagen─────────────────> asset_pending
asset_pending ──asset staged asociado──────> asset_ready
asset_ready ──commit transaccional─────────> committed

prepared/asset_pending/asset_ready ──vence─> expired
prepared/asset_pending/asset_ready ──terminal> failed
committed ──mismo operationId/comando──────> committed (replay)
```

- Una lease vigente solo puede completarse con su `asset_lease_id`.
- Una lease vencida puede reclamarse otra vez por el mismo actor, cliente, `operationId` y `commandHash`.
- Otro `operationId`, actor, cliente, ambiente o hash no toma la lease.
- `asset_ready` reusa `staged_asset_id`; no vuelve a descargar.
- Un asset staged que no llega a commit conserva expiración de feature 013.

## RPC v2

### `control.claim_business_agent_asset_import`

Bloquea operación; valida token, actor, cliente, ambiente, expiración, `operationId`, `commandHash`, derechos y
hash de URL. Devuelve una de:

- `{ action: "download", leaseId, sourceOrigin, altText }`;
- `{ action: "reuse", stagedAssetId }`;
- `{ action: "committed", result }`;
- error estable `agent_asset_import_in_progress` con retry.

La RPC no recibe ni persiste la URL completa; el worker compara/hash antes de llamarla.

### `control.attach_business_agent_staged_asset`

Valida lease, propiedad/estado/vencimiento del asset y fija `staged_asset_id`, luego pasa a `asset_ready`.

### `control.commit_business_agent_operation`

Bloquea operación y targets en orden: operación → perfil (si aplica) → QR (si aplica) → asset. Revalida estado,
revisiones, consentimientos, duplicado y comando. Para `setup`, crea/reutiliza/publica y asigna QR. Para
`profile_update`, actualiza el estado final completo. Guarda auditoría y resultado en la misma transacción.

Todas las funciones son `security invoker`, `search_path = ''`, nombres calificados, grants revocados a
`public/anon/authenticated` y `EXECUTE` solo para `service_role`.

## Índices

- único `preparation_token_hash`;
- único parcial `operation_id WHERE operation_id IS NOT NULL`;
- `(actor_user_id, oauth_client_id, created_at DESC)` para auditoría/rate limiting;
- `(state, expires_at)` parcial para estados no terminales;
- `(target_profile_id, created_at DESC)` y `(target_qr_unit_id, created_at DESC)`.

Se validan con `EXPLAIN`; no se agrega `pg_trgm` ni índice JSONB para esta feature.

## RLS, grants y retención

- RLS habilitado y forzado.
- Sin policies cliente; `public`, `anon`, `authenticated` sin grants.
- Solo el backend con service role lee/escribe.
- Operaciones y resultados se conservan 30 días para recuperación/auditoría; luego un proceso futuro puede
  purgar tokens/hash/propuestas. La implementación de cron de purga queda fuera de v1, pero ninguna FK usa
  cascada destructiva.

## Auditoría durable

La auditoría existente de perfiles/QR recibe metadata mínima:

```text
source=agent_mcp_v2
tool
operationId
oauthClientId
environment
assetSourceHash?  (hash, nunca URL)
```

No almacena preparation token, access/refresh token, lease ID, URL completa, query string, contenido de imagen
ni el payload entero del perfil.
