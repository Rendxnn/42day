# Contrato API: handoff NFC.cool

## `POST /admin/dynamic-links/:id/nfc-handoff`

Autorización: `system_admin`.

### Respuesta exitosa

```ts
type NfcCoolHandoffResponse = {
  provider: "nfc_cool";
  handoffUrl: string;
  shortcutName: "Escribir NFC ParaHoy";
  setupUrl: "https://nfc.cool/developers/";
};
```

`handoffUrl` debe parsear como:

```text
shortcuts://run-shortcut?name=Escribir+NFC+ParaHoy&input=text&text=<url-permanente-codificada>
```

El valor decodificado de `text` es exactamente `unit.publicUrl`. La respuesta no expone `token`, `sessionId`, callback, UID, destino, tenant ni correo.

### Errores

| Estado | Código | Condición |
| --- | --- | --- |
| 401/403 | auth existente | No hay sesión válida de `system_admin`. |
| 404 | `dynamic_link_not_found` | No existe la unidad. |
| 409 | `dynamic_link_archived` | La unidad está archivada. |
| 502 | `nfc_handoff_failed` | El adaptador no puede construir una URL segura. |

## Compatibilidad: `POST /admin/nfc-handoff/:sessionId/consume`

Permanece disponible solo para canjear una sesión NFC Helper emitida previamente. No es invocado por NFC.cool, no se documenta como acción nueva del dashboard y no representa verificación física.
