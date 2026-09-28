# Evolución segura de QR/NFC, perfiles públicos y agente de campo

> Documento de continuidad del plan acordado originalmente y sus extensiones aprobadas. Corte de estado:
> 2026-09-28. El estado verificable vive en [current-status.md](../current-status.md); los criterios y
> tareas normativos siguen en los SPEC enlazados. No sustituye esos contratos.

> **Checkpoint de continuidad:** el código parcial disponible de 012–014 se guardó en un commit local el
> 2026-09-28 por solicitud explícita del usuario para continuar en otra máquina. Es un snapshot de trabajo,
> no una declaración de cierre, aprobación ni despliegue. No se ha empujado al remoto. `.codex-artifacts/`
> se preserva fuera del commit.

## Objetivo de producto

Desde un iPhone en la calle, el administrador debe poder describir un negocio a una tarea remota de Codex
que corre en el Mac autorizado, investigar y preparar una propuesta verificable y, después de revisar y
confirmar, crear o actualizar un perfil público y asignarlo al QR correcto. La URL física del QR/NFC es
permanente. El agente nunca debe escribir el chip, verificarlo, bloquearlo ni cambiarlo sin consentimiento.

La solución debe mantener una separación inequívoca entre **staging** y **producción**; preservar la
autorización humana; no exponer secretos al modelo; respetar aislamiento de tenant; y permitir continuar
manualmente si el flujo remoto o una aplicación NFC externa no está disponible.

## Plan maestro original

El plan original para inventario QR/NFC y perfiles se divide así. Las etiquetas describen el estado local
documentado, no certifican un despliegue externo.

| Fase original | Resultado acordado | Estado local al corte |
| --- | --- | --- |
| 0. Reconciliar documentación y Spec Kit | Corregir documentación contradictoria; diferenciar evidencia histórica, estado implementado y gates externos. | **Parcial.** Hay auditoría y varias correcciones, pero quedan documentos históricos que necesitan reconciliación al converger las features activas. |
| 1. Inventario paginado y edición protegida | Buscar, filtrar, ordenar y paginar desde servidor; proteger la edición accidental de QRs activos; separar estado lógico de bloqueo NFC físico. | **Implementada en el producto existente;** no es el bloqueo actual de las features 012–014. Consultar specs 005 y la evidencia de 009. |
| 2. Perfil ligero canónico | Crear perfiles independientes o vinculados a restaurante, con enlaces activables, borrador/publicación y compatibilidad `/r/:tenantSlug`. | **Implementada como base.** Existe inventario/edición y una ruta MCP legacy de setup. La personalización visual pertenece a la extensión posterior 013. |
| 3. Configuración de varios QRs | Escanear/agrupar varias unidades, preflight y aplicar cambios con revisiones, consentimiento e idempotencia. | **Implementada en la base local existente** según features 007/009; no confundir esta capacidad con las operaciones v2 del agente, que siguen pendientes. |
| 4. Escritura NFC desde iPhone | Evaluar una app externa; escribir siempre la URL permanente; callback nunca acredita verificación o bloqueo; fallback manual obligatorio. | **Decisión revisada.** NFC Helper presentó truncamiento y NFC.cool exigía una función paga para el atajo probado. La feature 012 retiró ambos handoffs visibles y deja solo copiar la URL. La escritura/verificación física sigue siendo manual y no certificada por el dashboard. |
| 5. Convergencia y certificación | Revisar seguridad/UX, pruebas locales, rendimiento, staging autorizado, pruebas físicas y gates de producción separados. | **Pendiente parcialmente.** No hay autorización ni acción de staging/producción en el trabajo actual. |

La secuencia original está respaldada por [005 — inventario](../../specs/005-inventory-pagination-protected-edit/spec.md),
[006 — perfiles ligeros](../../specs/006-business-link-profiles/spec.md),
[007 — configuración por lote](../../specs/007-bulk-dynamic-link-setup/spec.md) y
[008 — handoff NFC histórico](../../specs/008-ios-nfc-handoff/spec.md). El handoff NFC de 008 es evidencia
histórica, no una instrucción vigente.

## Extensiones acordadas después del plan original

### 012 — Copia manual como único flujo NFC

La app externa no cumple de forma suficientemente confiable/gratuita el objetivo de escritura con un clic.
Por tanto, ParaHoy solo copia la URL permanente. La interfaz no ofrece NFC.cool ni NFC Helper. Una acción de
copiar no registra escritura, UID, verificación ni bloqueo; la ruta antigua de creación de handoff devuelve
`410 nfc_handoff_disabled` después de autenticar. El canje de callbacks NFC Helper solo se conserva por
compatibilidad con sesiones históricas.

**Estado:** implementación y pruebas dirigidas locales disponibles; formalización pendiente por revisión
independiente de `checklists/safety.md`, gates generales, `speckit-converge` y commit.

### 013 — Apariencia personalizable del perfil

Mantener estructura fija de tarjeta pública y permitir nombre, titular, ubicación, avatar, cuatro colores y
modo de iconografía `brand`/`monochrome`. Enlaces habilitados se muestran como tarjetas y los deshabilitados
no se exponen. Las marcas oficiales no se recolorean. Contraste, validación de imagen, revisión optimista,
storage privado, permisos y vista previa son parte del contrato. El mismo estado debe poder editarse por
`system_admin` y por el manager únicamente para el perfil de su tenant.

**Estado:** hay implementación parcial local y una migración de apariencia/assets aplicada solo a Supabase
local. La migración se lintó y se ejecutaron tres tests SQL transaccionales el 2026-09-24. No se ha aplicado
a staging/producción ni probado desde una base limpia. Faltan recursos oficiales de marca/procedencia,
integración completa de manager, backfill/RPC según contrato, cobertura adicional y revisión independiente.

### 014 — Agente remoto de campo

Usar una tarea dedicada de Codex Remote projectless abierta desde iPhone y ejecutada en el Mac autorizado.
El plugin de staging y el de producción son distintos. El agente verifica cuenta, rol y ambiente; investiga
fuentes públicas; entrega evidencia y un diff; llama `prepare`; presenta el resumen; solicita confirmación
humana; y luego llama `commit`. El backend valida OAuth, permisos, revisiones, consentimientos, idempotencia
y transacción. No se expone el Mac a internet. La importación de una imagen remota solo se hará después de la
confirmación y del consentimiento explícito de uso.

**Estado:** parcial. Hay ruta MCP legacy de setup, lectura exacta de QR, validación JWT/JWKS inicial,
consentimiento OAuth local y archivos de plugins separados. Faltan operaciones persistentes v2/RPC,
actualización de perfil, importación remota protegida contra SSRF, cobertura OAuth completa y conexión real
de los plugins. El flujo móvil todavía no está listo para operar prospectos desde staging.

Normas completas: [SPEC 012](../../specs/012-manual-nfc-copy-only/spec.md),
[SPEC 013](../../specs/013-brandable-business-profiles/spec.md) y
[SPEC 014](../../specs/014-parahoy-remote-field-agent/spec.md).

## Próximos pasos naturales y dependencias

No desplegar ahora. Avanzar de forma local y en commits pequeños que correspondan a fases completas y
verificadas:

1. **Estabilizar el handoff del repositorio.** Revisar `git status`, rama, `git log` y diffs antes de tocar;
   preservar `.codex-artifacts/` y otros archivos no relacionados. El checkpoint local del 2026-09-28 incluye
   el código parcial y las especificaciones para transferir contexto, pero no está empujado al remoto y no
   declara fases completas. El gate independiente no puede ser aprobado por el mismo implementador.
2. **Cerrar 012.** Ejecutar/verificar sus tests con el loader definido por el repo, revisar
   `checklists/safety.md` con otra persona, correr los gates de raíz cuando el launcher pnpm sea confiable,
   converger el SPEC y solo entonces crear su commit enfocado.
3. **Completar 013 antes de extender el agente.** Terminar recursos/iconos con fuente y condiciones
   registradas; completar flujo manager; revisar backfill/RPC y reglas de DB contra `spec.md`; ampliar pruebas
   API/SQL/UI; probar migración en una base desechable limpia sin borrar la instancia local existente;
   completar accesibilidad y revisión independiente. Converger y commitear fases verificadas.
4. **Completar 014 por capas.** Primero tipos v2 y hash canónico; luego migración/RPC idempotentes y pruebas
   locales; después OAuth/JWKS/consentimiento; luego herramientas MCP de prepare/commit y actualización;
   por último el importador HTTPS protegido contra SSRF y la validación de paquetes/plugins. No conectar
   plugins hasta certificar que informan el ambiente correcto y que las capacidades anunciadas coinciden
   con el servidor.
5. **Cerrar las puertas locales.** Suite completa, typecheck/build, lint SQL, RLS/grants/Storage y
   escenarios de replay/stale/rate-limit; `speckit-analyze`, revisión independiente, `speckit-converge` y
   documentación fiel. Registrar bloqueos, no llamarlos éxitos.
6. **Preparar staging como proyecto aparte y pedir autorización explícita antes de aplicarlo.** Identificar
   commit y migración exactos, respaldar/dry-run, configurar OAuth/allowlist de staging, instalar solo el
   plugin de staging, probar desde iPhone y ejecutar la matriz de 20 recorridos. Staging no autoriza
   producción.
7. **Producción solo con autorización nueva y explícita**, nombrando commit, Worker, dashboard, migración,
   OAuth y canario. Revisar rollback y observar antes de considerar certificado.

## Estado de ambientes y datos

- `20260924142711_brandable_business_profiles.sql`: aplicada solo a Supabase local, según evidencia de
  `specs/013-brandable-business-profiles/quickstart.md`; no remota.
- OAuth server: habilitado en `supabase/config.toml` local; no se configuró cliente, allowlist ni callback
  remoto de staging/producción como parte de este corte.
- Plugins: existen como archivos versionables, pero no están instalados ni conectados a un MCP remoto.
- No se desplegó API/dashboard/Worker, no se migró staging/producción y no se cambió producción.
- La tarea necesita conservar el Mac autorizado online y accesible por Codex Remote. El plugin remoto debe
  ser explícito por ambiente y pedir confirmación antes de cada escritura pública.

## Prompt para retomar en otra máquina

Pegar este prompt al nuevo agente después de abrir el repositorio. Los archivos referenciados son la fuente
de contexto; no hace falta reconstruir la conversación previa.

```text
Continúa la implementación local del flujo seguro de QR/NFC, perfiles personalizables y agente remoto de
prospectos en este repositorio. Antes de cambiar nada, lee en este orden:

1. AGENTS.md
2. PROJECT_CONTEXT.md y docs/current-status.md
3. docs/plans/qr-nfc-profiles-and-remote-agent.md
4. .specify/memory/constitution.md, ARCHITECTURE.md, CODESTYLE.md y TESTING.md
5. specs/012-manual-nfc-copy-only/ (spec, plan, tasks, checklist, contratos y quickstart)
6. specs/013-brandable-business-profiles/ (todos sus artefactos, especialmente tasks, contratos, quickstart y checklist)
7. specs/014-parahoy-remote-field-agent/ (todos sus artefactos, especialmente plan, tasks, modelo de datos,
   contratos, quickstart y checklist)
8. specs/009-profile-management-agent-actions/ y docs/runbooks/remote-prospect-agent.md

Después inspecciona `git status`, la rama, `git log` y diffs antes de editar. Preserva cambios del usuario y
`.codex-artifacts/`; no descartes, resetees ni sobrescribas trabajo existente. El checkpoint local del
2026-09-28 guarda el código parcial de 012–014 para el handoff, pero no significa que esas features estén
cerradas y aún no se ha empujado al remoto. El estado al 2026-09-28 es
parcial: 012 necesita revisión independiente y convergencia; 013 tiene implementación parcial y una migración
aplicada solo a Supabase local; 014 tiene OAuth/MCP/plugins parciales pero carece de operaciones v2 y del
importador remoto seguro. Los tests dirigidos (20 API, 7 dashboard, 2 core) y typechecks de API/dashboard/core/types
pasaron en ese corte; no se certificaron las suites raíz `pnpm test/typecheck/build`. La CLI de Supabase no
pudo iniciarse por escritura de telemetría fuera del workspace. No presentes gates bloqueados como exitosos.

Continúa una fase acotada a la vez según `tasks.md`; primero resuelve el gate más temprano pendiente y sus
dependencias, sin volver a implementar lo ya existente. Mantén el SPEC/plan/tareas alineados antes de cambiar
arquitectura o contratos. Pide revisión externa para checklists que dicen “independiente”; no te autoapruebes.
Ejecuta pruebas de comportamiento. Crea commits Conventional solo para fases completas y verificadas.

No apliques migraciones remotas, no despliegues, no configures OAuth/secretos, no conectes plugins a staging
ni producción y no operes sobre datos reales sin autorización explícita posterior que nombre el ambiente y
la acción. La meta inmediata es completar localmente 012, después 013 y después 014; staging y producción
son gates separados. Al finalizar, actualiza docs/current-status.md y este plan con evidencia fechada.
```
