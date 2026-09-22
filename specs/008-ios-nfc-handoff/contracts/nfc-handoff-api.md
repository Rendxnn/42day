# Contrato API — handoff NFC

## `POST /admin/dynamic-links/:id/nfc-handoff`

Devuelve `{ sessionId, token, expiresAt, handoffUrl }`. El token es de un solo uso y solo se entrega al navegador autenticado; el `handoffUrl` contiene la URL pública y callback, nunca el token.

## `POST /admin/nfc-handoff/:sessionId/consume`

Recibe `{ token, reportedUid? }` y devuelve `{ sessionId, unitId, reportedUid, reportedAt }`. Repetir, expirar, cambiar de actor o manipular el token responde 409/403. El endpoint no actualiza hitos de verificación física.
