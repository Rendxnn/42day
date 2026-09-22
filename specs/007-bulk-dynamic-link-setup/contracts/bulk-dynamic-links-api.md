# Contrato API — configuración masiva

## `POST /admin/dynamic-links/bulk-configuration/preflight`

Recibe `{ units: [{ id, revision }], target }`. `target` es `{ kind: "profile", profileId }` o `{ kind: "redirect", destinationType, destinationUrl, associationMode, tenantId? }`.

Devuelve `{ eligible, protected, excluded, target }`. Cada elemento contiene `id`, `publicCode`, `status`, `revision`, `destinationType`, `destinationUrl`, `label` y `reason` cuando no es elegible.

## `POST /admin/dynamic-links/bulk-configuration`

Recibe `{ operationId, units, target, consentedActiveUnitIds }`. `operationId` es UUID y las unidades incluyen la revisión del preflight. Devuelve `{ operationId, status, units, completedAt }`.

Los conflictos responden 409; reutilizar un `operationId` con otro hash responde 409. El endpoint nunca expone tokens ni escribe directamente desde el cliente a Supabase.
