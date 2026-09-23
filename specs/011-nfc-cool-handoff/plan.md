# Plan de implementación: handoff NFC.cool en iPhone

**Branch**: `011-nfc-cool-handoff` | **Fecha**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

## Resumen

Se sustituye el proveedor visible de escritura NFC por NFC.cool mediante un Atajo de iPhone llamado `Escribir NFC ParaHoy`. El Worker continúa siendo la frontera autorizada: recibe el identificador de unidad, rechaza unidades archivadas y genera un enlace de Atajos con la URL permanente. El enlace no requiere ni crea una sesión, pues NFC.cool no documenta callback de escritura equivalente. NFC Helper y su canje de callbacks existentes se conservan como código legado para sesiones anteriores, pero ninguna UI ni respuesta nueva puede generarlo.

No hay migraciones: no se cambian datos, RLS, RPC ni estado de una unidad.

## Contexto técnico

**Lenguaje/versión**: TypeScript, monorepo pnpm/Turborepo.  
**Dependencias primarias**: Cloudflare Workers + Hono, React + Vite, `@42day/types`, `@42day/core`.  
**Almacenamiento**: No aplica para el nuevo handoff. Las sesiones existentes de NFC Helper permanecen sin cambio para compatibilidad.  
**Pruebas**: `node:test` para API/dashboard, typecheck y build de los workspaces afectados.  
**Plataforma objetivo**: Dashboard web en Safari iPhone; Atajos de iOS con NFC.cool instalado.  
**Tipo de proyecto**: Aplicación web con API.  
**Objetivo de rendimiento**: El endpoint no debe realizar escrituras ni consultas distintas a cargar la unidad autorizada.  
**Restricciones**: Solo `system_admin`; URL permanente HTTPS; sin bearer, callback, sesión, UID, tenant o destino en el enlace externo; no registrar hitos físicos automáticamente.  
**Escala**: Una unidad por lanzamiento; el flujo masivo conserva su cola manual y no se modifica en este feature.

## Constitution Check

| Principio | Estado | Evidencia de diseño |
| --- | --- | --- |
| I. Especificación antes de implementación | Pasa | `spec.md`, checklist, este plan, contrato y tareas preceden código. |
| II. Arquitectura y responsabilidades | Pasa | El adaptador vive en `features/dynamic-links`; rutas solo autorizan, cargan unidad y delegan. |
| III. Pruebas y trazabilidad | Pasa | Cada RF se mapea a pruebas API/UI o a spike físico externo. |
| IV. Entrega por fases verificadas | Pasa | Tareas separan contrato, API, UI, documentación y gates. |
| V. Invariantes y seguridad | Pasa | No hay mutación de unidad; se conserva URL permanente y autorización `system_admin`. |

## Investigación y decisiones

Ver [research.md](./research.md). Decisiones que guían la implementación:

1. NFC.cool recibe la URL mediante la acción `Write NFC` de Atajos, no mediante un esquema de escritura propio documentado.
2. El dashboard abre un Atajo existente usando `shortcuts://run-shortcut` con el valor en `text`; Apple documenta esta entrada como texto URL-codificado.
3. La ausencia de callback se trata como una restricción deliberada: no se crea sesión de handoff y la escritura se verifica leyendo el chip.
4. NFC Helper queda encapsulado como adaptador legado deshabilitado; la ruta de consumo se mantiene para callbacks de sesiones ya iniciadas.

## Arquitectura resultante

```text
QuickDynamicLinkSetup
  -> POST /admin/dynamic-links/:id/nfc-handoff
       -> requireSystemAdmin
       -> findDynamicLinkUnitById
       -> buildActiveNfcHandoff(unit.publicUrl)
            -> NFC.cool: shortcuts://run-shortcut?...&text=<URL permanente>
  -> Atajos (iPhone) -> NFC.cool Write NFC -> chip

Fallback: Copiar URL permanente -> cualquier escritor NFC
Verificación: lectura física -> hito manual separado

Código legado: NFC Helper callback -> consume endpoint existente (solo sesiones previas)
```

### Responsabilidades

- `apps/api/src/features/dynamic-links/nfc-handoff.ts`: Define proveedor activo, nombre de Atajo, construcción y validación pura del enlace NFC.cool. Conserva el constructor NFC Helper como legado no seleccionado.
- `apps/api/src/features/dynamic-links/admin-routes.ts`: Autoriza, carga la unidad, rechaza archivadas y devuelve el contrato activo; no crea sesiones para NFC.cool.
- `packages/types/src/dynamic-links.ts`: Expone el contrato discriminado para el handoff activo y conserva los tipos de consumo legado mientras exista la ruta.
- `apps/dashboard/src/features/admin/QuickDynamicLinkSetup.tsx`: Invoca el endpoint, abre NFC.cool, mantiene copia manual y presenta guía de preparación/seguridad.
- `apps/dashboard/src/features/admin/DynamicLinksSection.tsx`: Mantiene únicamente el consumo de callbacks legados emitidos antes del cambio; no inicia NFC Helper.

## Contrato y datos

No se agregan entidades ni cambios de datos. Ver [data-model.md](./data-model.md) y [contrato de handoff](./contracts/nfc-cool-handoff-api.md).

El endpoint existente conserva su ruta:

```text
POST /admin/dynamic-links/:id/nfc-handoff
```

Su respuesta nueva contiene `provider: "nfc_cool"`, el enlace de Atajos, el nombre de Atajo y la URL de ayuda. No contiene token, `sessionId`, callback ni UID. `POST /admin/nfc-handoff/:sessionId/consume` queda deprecado para callbacks NFC Helper ya iniciados y no lo invoca la UI nueva.

## Estructura de archivos

```text
apps/api/
├── src/features/dynamic-links/
│   ├── admin-routes.ts
│   └── nfc-handoff.ts
└── test/dynamic-links-bulk-nfc.test.mjs

apps/dashboard/
├── src/features/admin/
│   ├── QuickDynamicLinkSetup.tsx
│   └── DynamicLinksSection.tsx
└── test/bulk-nfc-setup.test.mjs

packages/types/src/dynamic-links.ts
docs/current-status.md
docs/runbooks/smoke-tests.md
specs/011-nfc-cool-handoff/
```

## Rollout y compatibilidad

1. El código nuevo selecciona NFC.cool de forma fija; no se agrega un flag remoto que pueda reactivar NFC Helper accidentalmente.
2. Las sesiones NFC Helper que ya hubieran sido emitidas conservan su endpoint de consumo hasta expirar; no se emiten nuevas.
3. La UI deja de mostrar el botón/instalación de NFC Helper y muestra NFC.cool, la configuración única del Atajo y `Copiar enlace para NFC`.
4. Staging requiere una prueba física de 20 ciclos con NTAG213 antes de certificar NFC.cool. Si falla, se conserva el fallback manual y cualquier reactivación de Helper exige un feature y validación nuevos.
5. No se publica en producción en este feature sin autorización expresa posterior.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| El Atajo no está instalado, tiene otro nombre o NFC.cool no expone `Write NFC` | Fallo no mutante, fallback de copia e instrucciones visibles. |
| Codificación doble o URL no permanente | Constructor puro con validación HTTPS, test de `searchParams.get("text")` y datos solo desde servidor. |
| Operador interpreta abrir Atajos como escritura exitosa | Copy explícito y ninguna mutación automática de hitos/UID. |
| Callback legado queda roto durante transición | Se preserva endpoint de consumo y se separa visualmente de la ruta activa. |
| Cambio externo de NFC.cool | Adaptador aislado y spike físico como gate; no se acopla la UI al formato de URL. |

## Mapeo requisito → evidencia

| Requisito | Evidencia |
| --- | --- |
| FR-001, FR-002, FR-004 | Prueba API de respuesta `nfc_cool`, parseo de URL y ausencia de datos sensibles. |
| FR-003 | Prueba API de unidad archivada sin enlace. |
| FR-005 | Prueba API/UI: no se devuelve ni se muestra `nfchelper://`; constructor legado aislado. |
| FR-006, FR-008 | Prueba dashboard y revisión manual de la guía/copia. |
| FR-007 | Prueba API que no llama RPC de sesión; prueba UI que no consume callback ni registra hitos. |
| FR-009 | `docs/current-status.md`, `docs/runbooks/smoke-tests.md` y quickstart actualizados. |
| SC-003 | Evidencia física manual fechada, 20 lecturas/escrituras en staging; no sustituible por prueba unitaria. |
