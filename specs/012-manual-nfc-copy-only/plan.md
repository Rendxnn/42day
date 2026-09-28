# Plan de implementación: copia manual como único flujo NFC

**Feature**: `012-manual-nfc-copy-only` | **Fecha**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

## Resumen

Retirar el handoff visible a NFC.cool sin reemplazarlo por otro proveedor. La UI usará directamente la URL
permanente ya presente en la unidad y conservará la explicación de verificación física. El endpoint de
creación de handoff se mantendrá temporalmente como frontera autenticada que devuelve `410`; NFC Helper
seguirá encapsulado como legado no seleccionable.

No hay migración ni cambio de datos.

## Contexto técnico

**Lenguaje/versión**: TypeScript 5.7, Node.js 22 para pruebas.
**Dependencias**: React/Vite, Hono, `@42day/types`; no se añaden dependencias.
**Persistencia**: sin cambios; las sesiones históricas de NFC Helper permanecen intactas.
**Pruebas**: `node:test`, pruebas de comportamiento API/dashboard, typecheck y build.
**Plataforma**: dashboard web móvil y Worker de Cloudflare.
**Rendimiento**: la copia no hace request; la ruta legacy responde después de autenticación sin consultar
datos de la unidad.
**Restricciones**: `system_admin`, URL permanente, cero hitos automáticos, cero despliegue productivo.
**Escala**: una unidad por acción; la cola masiva solo conserva sus enlaces visibles.

## Constitution Check

| Principio | Estado | Evidencia |
| --- | --- | --- |
| Especificación previa | Pasa | SPEC, contratos, tareas y pruebas preceden el cambio. |
| Dueño de arquitectura | Pasa | Dynamic Links conserva la responsabilidad; React solo copia. |
| Pruebas observables | Pasa | Se cubren portapapeles, respuesta legacy y ausencia de mutación. |
| Entrega por fases | Pasa | Contrato, API, UI y documentación tienen checkpoints separados. |
| Seguridad | Pasa | No salen tokens/destinos ni se crea estado nuevo. |

## Decisiones de diseño

1. La UI no llamará `/admin/dynamic-links/:id/nfc-handoff`; copiará `unit.publicUrl` ya obtenido mediante
   la API autorizada.
2. La ruta histórica permanece para no convertir clientes antiguos en un 404 ambiguo. Después de
   `requireSystemAdmin`, devuelve HTTP `410` con `{ error, message }` y no carga la unidad.
3. El constructor NFC.cool deja de ser parte del camino runtime. Su historia permanece en feature 011 y
   Git; no se conserva como proveedor seleccionable ni flag remoto.
4. El constructor y canje de NFC Helper permanecen aislados mientras exista la ruta histórica de consumo.
5. `copyToClipboard` debe intentar `navigator.clipboard.writeText`; ante rechazo, mantiene el texto visible,
   seleccionable y muestra copy controlado. No se introduce fallback inseguro basado en ejecución externa.

## Arquitectura resultante

```text
QuickDynamicLinkSetup
  -> unit.publicUrl
  -> navigator.clipboard.writeText
  -> mensaje éxito/error

Cliente antiguo
  -> POST /admin/dynamic-links/:id/nfc-handoff
  -> requireSystemAdmin
  -> 410 nfc_handoff_disabled

Legado aislado
  -> POST /admin/nfc-handoff/:sessionId/consume
  -> solo sesiones NFC Helper históricas
```

## Contrato y compatibilidad

Ver [manual-nfc-copy-api.md](./contracts/manual-nfc-copy-api.md).

- El endpoint legacy no se renombra.
- `NfcCoolHandoffResponse` deja de ser un contrato activo del dashboard.
- El error nuevo se añade al catálogo de copy seguro.
- La ruta de consumo conserva tipos y semántica hasta un feature de retiro explícito.

## Estructura objetivo

```text
packages/types/src/dynamic-links.ts
apps/api/src/features/dynamic-links/
├── admin-routes.ts
└── nfc-handoff.ts
apps/api/test/dynamic-links-bulk-nfc.test.mjs
apps/dashboard/src/
├── api.ts
└── features/admin/QuickDynamicLinkSetup.tsx
apps/dashboard/test/
├── bulk-nfc-setup.test.mjs
└── dynamic-link-quick-setup.test.mjs
docs/current-status.md
docs/runbooks/smoke-tests.md
apps/api/README.md
apps/dashboard/README.md
specs/011-nfc-cool-handoff/spec.md
```

## Rollout y rollback

1. Añadir primero pruebas que esperen copia única y `410`.
2. Cambiar API y tipos, luego retirar UI/guía.
3. Actualizar toda afirmación durable de proveedor activo.
4. Validar localmente y crear commit `fix(nfc): keep manual copy as the only handoff`.
5. Staging requiere autorización de despliegue separada; producción requiere otra autorización posterior.

Rollback de código: restaurar el commit anterior. No hay rollback de datos. Reactivar un proveedor no puede
hacerse mediante variable: requiere un feature nuevo y evidencia física/comercial.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Queda copy o enlace de NFC.cool en otra pantalla | Búsqueda global y pruebas de ausencia más revisión durable. |
| Cliente antiguo interpreta 410 como error genérico | Código estable y mensaje accionable. |
| Copiar marca un hito accidentalmente | Acción local sin request y prueba de cero mutaciones. |
| Se elimina compatibilidad Helper por accidente | Prueba explícita del endpoint de consumo legado. |

## Trazabilidad

| Requisito | Evidencia prevista |
| --- | --- |
| FR-001–003, FR-007–008 | pruebas de comportamiento del dashboard y revisión 320 px |
| FR-004, FR-009 | contrato y pruebas API del `410` |
| FR-005–006 | regresión API de callback legado y cero RPC de escritura |
| FR-010 | búsqueda documental y revisión de enlaces |
| FR-011–012 | diff sin migraciones y gates de ambiente |

Revisión constitucional posterior al diseño: sin excepciones.
