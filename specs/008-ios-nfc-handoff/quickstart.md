# Quickstart — handoff NFC

1. Aplicar migraciones en staging con `supabase db push --linked`.
2. Desde una unidad activa, elegir `Escribir con NFC Helper` o `Copiar URL para otra app`.
3. Con NFC Helper instalado, completar/cancelar la escritura y volver mediante callback.
4. Confirmar UID solo si el operador lo leyó físicamente; después ejecutar verificación separada.
5. Repetir un callback para comprobar que la sesión de un solo uso se rechaza.
# Registro histórico — no es el flujo actual

> Desde 2026-09-24 el flujo visible de escritura automática quedó retirado por
> [012-manual-nfc-copy-only](../../012-manual-nfc-copy-only/spec.md). Los pasos siguientes documentan la
> integración histórica NFC Helper y no deben usarse como instrucciones vigentes.
