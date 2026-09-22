# Plan

`control.nfc_handoff_sessions` persiste únicamente hash del token, unidad, actor, vencimiento y resultado reportado. No contiene bearer, correo, tenant ni URL de callback. La verificación continúa siendo una lectura física posterior.
