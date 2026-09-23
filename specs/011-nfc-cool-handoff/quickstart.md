# Quickstart: validar handoff NFC.cool

## Preparación única del iPhone

1. Instalar NFC.cool Tools y confirmar que su versión/plan muestra la acción de Atajos `Write NFC`.
2. En Atajos, crear un atajo llamado exactamente `Escribir NFC ParaHoy`.
3. Configurarlo para recibir entrada de texto y pasarla a la acción `Write NFC` de NFC.cool como URL.
4. Mantener el atajo con ese nombre; renombrarlo rompe el lanzamiento desde ParaHoy.

## Validación funcional en staging

1. Abrir una unidad no archivada desde **Configuración rápida**.
2. Guardar/activar y seleccionar **Escribir con NFC.cool**.
3. Comprobar que Atajos abre `Escribir NFC ParaHoy` y que NFC.cool muestra exactamente la URL permanente del panel, no el destino final.
4. Cancelar antes de tocar un chip y comprobar que no cambian los hitos NFC ni el UID.
5. Usar **Copiar enlace para NFC** y comprobar que copia la misma URL permanente.
6. Intentar una unidad archivada por API o UI y confirmar que no inicia un handoff.

## Certificación física pendiente

1. Ejecutar 20 ciclos en el iPhone objetivo con NTAG213: chip nuevo, regrabable, preescrito y bloqueado.
2. Tras cada escritura, leer el chip con NFC.cool y con un segundo teléfono cuando sea posible.
3. Comparar exactamente el valor NDEF leído con la URL permanente mostrada por ParaHoy.
4. Registrar manualmente `NFC programado`, después `NFC verificado`, y solo registrar bloqueo físico una vez este ocurra realmente.
5. Anexar fecha, modelo de iPhone, versión iOS/NFC.cool, tipo de chip y resultados antes de certificar el proveedor.

## Verificación automatizada

```bash
pnpm --filter @42day/api test
pnpm --filter @42day/dashboard test
pnpm --filter @42day/api typecheck
pnpm --filter @42day/dashboard typecheck
pnpm --filter @42day/api build
pnpm --filter @42day/dashboard build
```

No se ejecutan migraciones para este feature.
