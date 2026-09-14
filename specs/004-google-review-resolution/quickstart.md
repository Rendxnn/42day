# Quickstart de validación

## Prerrequisitos

- Dependencias instaladas con la versión de pnpm fijada por el repositorio.
- Dashboard y API configurados según `docs/runbooks/local-setup.md`.
- Usuario `system_admin` para smoke manual.

## Verificación automatizada

```bash
node --experimental-loader ./apps/api/headless/resolve-loader.mjs --test --experimental-strip-types packages/core/test/dynamic-links.test.mjs
node --experimental-loader ./apps/api/headless/resolve-loader.mjs --test --experimental-strip-types apps/api/test/dynamic-links.test.mjs
node --test apps/dashboard/test/dynamic-link-quick-setup.test.mjs
node --test apps/dashboard/test/dynamic-link-quick-setup-behavior.test.mjs
pnpm typecheck
pnpm test
pnpm build
```

## Smoke local

1. Cargar una unidad disponible en configuración rápida.
2. Pegar una URL completa de Maps con feature ID y prepararla.
3. Comprobar que aparece candidato y el guardado sigue bloqueado.
4. Abrir, regresar y confirmar el negocio.
5. Guardar; comprobar destino directo y `publicUrl` intacta.
6. Repetir con WhatsApp; no debe aparecer preparación Google.
7. Repetir con un host externo parecido a Google; no debe haber fetch ni mutación.

## Validación real en staging

Solo con autorización posterior de staging; no autoriza producción.

- Probar el enlace del usuario, tres fichas adicionales, Android, iPhone, URL completa, enlace directo y una dirección.
- Probar Safari y Chrome móvil a 320 px.
- Rechazar una dirección y comprobar que formulario/unidad se conservan.
- Revisar logs sin URL completa, feature ID ni body.

## Rollback

Retirar cliente/interacción y ruta del resolver. Los destinos directos guardados permanecen válidos y no hay migración que revertir.
