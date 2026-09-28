# Modelo de datos: copia manual NFC

## Sin cambios persistentes

La feature no añade ni modifica tablas, columnas, índices, RPC, RLS, grants o buckets.

## Estado operativo

| Concepto | Fuente | Regla |
| --- | --- | --- |
| URL copiable | `DynamicLinkUnit.publicUrl` | Es la única cadena enviada al portapapeles. |
| Destino final | Unidad existente | Nunca se copia como valor NFC. |
| Hitos NFC | Unidad existente | No cambian por copiar. |
| Sesión Helper histórica | `control.nfc_handoff_sessions` | Solo puede consumirse por la ruta legacy existente. |

## Transiciones

Copiar tiene transición de datos nula:

```text
unidad antes == unidad después
sesiones antes == sesiones después
auditoría antes == auditoría después
```

El endpoint legacy de creación tampoco persiste: autentica y devuelve `410`.
