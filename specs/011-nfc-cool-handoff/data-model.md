# Modelo de datos: handoff NFC.cool

No se introducen tablas, columnas, RPC ni migraciones.

## Configuración de adaptador (código)

| Campo | Valor | Regla |
| --- | --- | --- |
| `activeProvider` | `nfc_cool` | Único proveedor seleccionable por la UI y endpoint nuevos. |
| `shortcutName` | `Escribir NFC ParaHoy` | Nombre canónico que debe existir en Atajos del operador. |
| `shortcutInput` | URL permanente de la unidad | Solo HTTPS, construida por backend y codificada una vez. |
| `legacyProvider` | `nfc_helper` | Conservado en código; no seleccionable ni retornado por handoffs nuevos. |

## Estado de unidad

El handoff no escribe ni cambia `destination_url`, `nfc_uid`, `nfc_programmed_at`, `nfc_verified_at` o `nfc_locked_at`. Esos campos conservan el flujo actual de hitos manuales y verificación física.

## Compatibilidad

`control.nfc_handoff_sessions` y sus RPC existentes no cambian. Solo atienden callbacks NFC Helper creados antes del cambio; NFC.cool no crea nuevas sesiones.
