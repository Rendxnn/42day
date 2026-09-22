# Especificación: handoff NFC en iPhone

**Estado:** adaptador y sesión preparados para implementación local/staging; spike físico obligatorio pendiente.

Safari no escribe NFC. El dashboard ofrecerá un adaptador opcional para NFC Helper y un fallback manual. Siempre transmite la URL permanente, no el destino. Una sesión de diez minutos, de único uso y token opaco permite volver al dashboard; un callback solo reporta escritura, nunca marca verificación o bloqueo físico. El UID solo se persiste después de confirmar el operador. El callback no contiene bearer tokens.

## Requisitos funcionales

- **RF-008-01:** crear una sesión de handoff para una unidad no archivada con expiración máxima de diez minutos.
- **RF-008-02:** generar un deep link opcional a NFC Helper con URL permanente y callback opaco.
- **RF-008-03:** canjear el callback una sola vez, validando actor, hash, expiración y UID acotado.
- **RF-008-04:** conservar fallback de copiar URL/abrir otra app cuando NFC Helper no esté instalado.
- **RF-008-05:** nunca marcar `nfcVerifiedAt` o `nfcLockedAt` por el callback.

## Gates pendientes

- Spike con NTAG213: URL escapada, cancelación, callback, app ausente y UID.
- Adaptador intercambiable, endpoints de crear/canjear sesión y cola masiva.
- 20 escrituras/lecturas físicas exitosas en el iPhone objetivo.
- Revisión independiente del checklist y convergencia Spec Kit.
