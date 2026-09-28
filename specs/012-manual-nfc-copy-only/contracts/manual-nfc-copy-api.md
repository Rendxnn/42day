# Contrato: copia manual y retiro de handoff NFC

## Dashboard

`QuickDynamicLinkSetup` usa el `publicUrl` de la unidad fresca. No existe request de handoff para copiar.

Resultado visual:

- éxito: `Enlace NFC copiado.`;
- error: `No pudimos copiar el enlace. Selecciónalo y cópialo manualmente.`;
- la URL permanece visible y seleccionable en ambos casos.

## Endpoint legado de creación

### `POST /dashboard/admin/dynamic-links/:id/nfc-handoff`

Requiere `system_admin`. Respuesta fija:

```json
{
  "error": "nfc_handoff_disabled",
  "message": "La escritura automática está deshabilitada. Copia la URL permanente desde la configuración rápida."
}
```

- HTTP `410 Gone`.
- No consulta ni muta la unidad.
- No devuelve `provider`, `handoffUrl`, `setupUrl`, token, sesión o callback.
- Un request sin autenticación continúa devolviendo `401` antes del `410`.

## Compatibilidad de consumo

### `POST /dashboard/admin/nfc-handoff/:sessionId/consume`

Conserva el contrato de feature 008 exclusivamente para sesiones NFC Helper históricas. No se enlaza desde
la UI y no crea nuevas sesiones. Sus errores de expiración, uso único y actor permanecen sin cambio.

## Tipos

- Retirar `NfcCoolHandoffResponse` de consumidores activos.
- Conservar `NfcHandoffConsumeResponse` mientras exista la ruta legacy.
- Añadir `nfc_handoff_disabled` al catálogo de errores controlados si el cliente común lo requiere.
