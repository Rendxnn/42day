# Modelo de datos — handoff NFC

`control.nfc_handoff_sessions` guarda solo `token_hash`, unidad, actor, vencimiento, uso y UID reportado. RLS está forzado y el acceso está restringido a `service_role`. La escritura y verificación física permanecen separadas.
