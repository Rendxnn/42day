# Quickstart de validación

## Prerrequisitos

- Dependencias instaladas con la versión de pnpm fijada por el repositorio.
- Dashboard y API configurados según `docs/runbooks/local-setup.md`.
- Usuario `system_admin` para smoke manual.

## Verificación automatizada

```bash
node --experimental-loader ./apps/api/headless/resolve-loader.mjs --test --experimental-strip-types packages/core/test/dynamic-links.test.mjs
node --experimental-loader ./apps/api/headless/resolve-loader.mjs --test --experimental-strip-types apps/api/test/dynamic-links.test.mjs
node --experimental-loader ./apps/api/headless/resolve-loader.mjs --test --experimental-strip-types apps/dashboard/test/dynamic-link-quick-setup.test.mjs apps/dashboard/test/dynamic-link-quick-setup-errors.test.mjs apps/dashboard/test/dynamic-link-quick-setup-behavior.test.mjs
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### Evidencia local — 2026-09-14

- 34/34 pruebas focalizadas de core, API y configuración rápida pasaron.
- `pnpm test`: 7/7 workspaces completaron correctamente; API ejecutó 265 pruebas, con 248 exitosas y
  17 opt-in omitidas según su configuración existente.
- `pnpm typecheck`: 7/7 workspaces completaron correctamente.
- `pnpm lint`: 7/7 workspaces completaron correctamente; los scripts existentes ejecutan
  `tsc --noEmit`, conforme a la deuda `ENG-001` ya documentada.
- `pnpm build`: 7/7 workspaces completaron correctamente. Vite conserva la advertencia preexistente
  por chunks mayores de 500 kB y Turbo las advertencias de outputs para paquetes cuyo build es
  únicamente `tsc --noEmit`.
- La suite automatizada no depende de Google, Supabase, staging ni producción: los redirects se
  verifican con un fetch inyectado y determinista. La regresión descrita abajo añade un smoke local
  opt-in contra el enlace público real, sin usar infraestructura de ParaHoy desplegada.

### Regresión observada — 2026-09-14

- El enlace corto reportado se reprodujo con `GET` y devolvió un solo `302` hacia la ruta raíz de
  `maps.google.com`, con el feature ID en `ftid`.
- Antes del ajuste, la clasificación resultaba `unsupported` aunque la extracción del ID resultaba
  `found`; esa diferencia causaba `google_review_redirect_invalid`.
- La prueba local opt-in contra el enlace real terminó con `sourceKind=maps_short_link`, un salto,
  host de reseña `www.google.com`, acción directa presente y confirmación humana requerida. Una
  repetición medida resolvió en 348 ms, dentro del presupuesto de 8 segundos.
- No se consultó el Worker para esta prueba funcional ni se modificó ningún recurso desplegado.

## Códigos de error y recuperación

| Código | Acción operativa |
| --- | --- |
| `google_review_url_invalid` | Pegar una URL HTTPS sin credenciales ni puerto personalizado. |
| `google_review_url_unsupported` | Abrir la ficha del negocio en Maps y volver a usar Compartir. |
| `google_review_identifier_missing` | Pegar un enlace directo de reseña; no se elige una ficha por aproximación. |
| `google_review_identifier_ambiguous` | Descartar el candidato y compartir nuevamente la ficha correcta. |
| `google_review_redirect_invalid` | No continuar: la cadena salió de los hosts admitidos, formó un bucle o excedió cinco saltos. |
| `google_review_upstream_failed` | Reintentar; si persiste, usar un enlace directo de reseña. |
| `google_review_resolution_timeout` | Reintentar; el límite es 3 segundos por petición y 8 segundos totales. |
| `rate_limited` | Esperar unos segundos antes de reintentar; queda reservado para protección global futura. |
| `dynamic_link_google_review_resolution_required` | Preparar, abrir y confirmar el enlace antes de guardar. |

Los logs permitidos incluyen host inicial, clase de entrada, saltos, duración y código de resultado.
Nunca deben incluir URL completa, `Location`, feature ID, body, cookies ni tokens.

## Trazabilidad implementada

| Requisitos / criterios | Evidencia |
| --- | --- |
| FR-001–FR-010, FR-022, FR-025; SC-001–SC-002 | `packages/core/test/dynamic-links.test.mjs` y resolver inyectable en `apps/api/test/dynamic-links.test.mjs`. |
| FR-011–FR-014, FR-021, FR-023–FR-024; SC-004 | Estados puros y caracterización de interacción en `apps/dashboard/test/dynamic-link-quick-setup-*.test.mjs`. |
| FR-015–FR-017; SC-003, SC-005 | Pruebas de ambos PATCH, compatibilidad legacy y regresión no Google en las suites de dynamic links. |
| FR-018–FR-020; SC-007 | Casos de timeout, upstream, SSRF, loop, ambigüedad, copies controlados y logs sanitizados. |
| SC-008 | Diff sin migraciones, bindings, dependencias o cambios a la URL permanente. |
| SC-006 | Pendiente de evidencia manual en staging autorizado con Safari y Chrome móvil a 320 px. |

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
