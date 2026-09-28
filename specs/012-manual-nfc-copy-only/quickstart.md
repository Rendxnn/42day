# Quickstart: validar copia manual NFC

## Prerrequisitos

- API y dashboard locales configurados.
- Usuario `system_admin`.
- Una unidad no archivada conocida.
- No se requiere una aplicación NFC.

## Validación automatizada

```bash
pnpm --filter @42day/api test
pnpm --filter @42day/dashboard test
pnpm --filter @42day/api typecheck
pnpm --filter @42day/dashboard typecheck
pnpm --filter @42day/dashboard build
```

## Recorrido manual

1. Abre Configuración rápida y carga una unidad.
2. Confirma que no aparece NFC.cool, NFC Helper, Atajos, instalación ni guía de proveedor.
3. Confirma que la URL permanente está visible.
4. Usa `Copiar enlace para NFC` y pega el resultado en una nota.
5. Compara byte a byte con la URL mostrada y con la codificada por el QR.
6. Deniega permiso de portapapeles o simula su fallo: debe aparecer el mensaje controlado y la URL debe
   poder seleccionarse.
7. Comprueba que revisión, destino, UID y los tres hitos NFC no cambiaron.
8. Llama el endpoint anterior con sesión admin: debe responder `410 nfc_handoff_disabled` sin URL externa.
9. Llama sin sesión: debe responder `401`.

## Evidencia documental

```bash
rg -n "NFC\.cool|Escribir NFC ParaHoy|Escribir con NFC" \
  docs apps/api/README.md apps/dashboard/README.md
```

Los únicos resultados permitidos son historia fechada o documentos de features anteriores claramente
marcados como reemplazados. La documentación vigente debe nombrar únicamente la copia manual.

## Gates

- No aplicar migraciones: el diff debe carecer de archivos nuevos bajo `supabase/migrations`.
- No desplegar producción.
- El callback Helper legado debe conservar su suite.
