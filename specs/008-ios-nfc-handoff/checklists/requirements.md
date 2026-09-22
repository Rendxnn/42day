# Checklist de requisitos — handoff NFC

- [ ] La URL escrita siempre es la URL pública permanente.
- [ ] La sesión expira en diez minutos y es de único uso.
- [ ] El token no aparece en logs, URLs ni datos persistidos en claro.
- [ ] Callback, UID, cancelación y error no falsifican verificación/bloqueo.
- [ ] Fallback manual funciona sin NFC Helper.
- [ ] El spike físico con NTAG213 queda evidenciado por un operador.
