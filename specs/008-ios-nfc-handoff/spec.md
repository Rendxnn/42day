# Especificación: handoff NFC en iPhone

**Estado:** preparado para spike físico obligatorio.

Safari no escribe NFC. El dashboard ofrecerá un adaptador opcional para NFC Helper y un fallback manual. Siempre transmite la URL permanente, no el destino. Una sesión de diez minutos, de único uso y token opaco permite volver al dashboard; un callback solo reporta escritura, nunca marca verificación o bloqueo físico. El UID solo se persiste después de confirmar el operador.

## Gates pendientes

- Spike con NTAG213: URL escapada, cancelación, callback, app ausente y UID.
- Adaptador intercambiable, endpoints de crear/canjear sesión y cola masiva.
- 20 escrituras/lecturas físicas exitosas en el iPhone objetivo.
