# Tareas: perfiles públicos personalizables

**Entrada obligatoria**: leer `spec.md`, `plan.md`, `research.md`, `data-model.md`, todos los contratos,
`quickstart.md`, `AGENTS.md`, `CODESTYLE.md` y `TESTING.md` antes de modificar código.

**Regla de ejecución**: completar una fase, ejecutar sus pruebas y crear un Conventional Commit enfocado antes
de pasar a la siguiente. No aplicar migraciones remotas ni desplegar sin autorización posterior explícita.

**Estado local 2026-09-28**: implementación parcial. Hay reglas puras, migración de assets/apariencia aplicada
en Supabase local (2026-09-24), validación/avatar en API, editor/preview parcial y proyección pública. Pasaron
3 pruebas SQL transaccionales y `supabase db lint --local` en la instancia local; no se probó desde una DB
limpia ni en remoto. Faltan los recursos SVG oficiales/procedencia, el recorrido equivalente de manager,
backfill/RPC completos, cobertura DB/UI, revisión independiente, gates integrales, commits y convergencia.
No declarar la feature lista para staging. Los checkboxes solo se marcan al cumplir el alcance y evidencia de
cada tarea; la presencia de código parcial no basta.

## Fase 1 — Contratos y reglas puras

- [x] T001 Extender los tipos canónicos de perfiles, requests, respuestas, avatar, apariencia, modo de iconos y
  códigos de error en `packages/types/src/business-profiles.ts` y sus exports.
- [x] T002 Añadir mensajes controlados en español para todos los errores de color, contraste y asset en el
  catálogo compartido; ningún componente debe mostrar el código crudo.
- [x] T003 Implementar normalización hexadecimal, luminancia, contraste, validación de apariencia e iniciales
  como funciones puras en `packages/core/src/business-profile-appearance.ts`.
- [x] T004 Añadir tests unitarios de T003, incluidos Unicode, valores frontera 4.5/3.0 y colores inválidos, en
  `packages/core/test/business-profile-appearance.test.mjs`.
- [x] T005 Ejecutar pruebas y typecheck focalizados de `@42day/types` y `@42day/core`; corregir todo fallo.
- [x] T006 Crear un Conventional Commit enfocado para contratos y reglas puras (`feat(profiles): define public appearance contract`).

## Fase 2 — Recursos de iconos controlados

- [ ] T007 Obtener los recursos oficiales vigentes de WhatsApp, Instagram y Google desde fuentes oficiales,
  conservar el formato permitido por cada marca y registrar URL, fecha, condiciones y hash SHA-256.
- [ ] T008 Crear el manifiesto tipado y assets locales bajo
  `apps/dashboard/src/features/business-profiles/brand-icons/`, sin recolor, redibujo ni alteración de proporción.
- [ ] T009 Implementar el mapa de pictogramas genéricos monocromos para todos los `kind` existentes, con fallback
  explícito para `custom`, usando `currentColor`.
- [ ] T010 Añadir tests que demuestren selección de recurso por `kind`/`iconMode`, ausencia de inferencia por URL
  y que los logos de marca no reciben `iconColor`.
- [ ] T011 Ejecutar pruebas focalizadas y revisión manual del manifiesto; crear Conventional Commit enfocado.

## Fase 3 — Esquema, bucket y RPC

- [ ] T012 Crear `supabase/migrations/<timestamp>_brandable_business_profiles.sql` con tabla de assets, columnas,
  defaults, constraints, FK restrictiva, índices, bucket privado, RLS forzado y grants revocados.
- [ ] T013 Incorporar el backfill idempotente de apariencia sin cambiar `revision`, `updated_at`, slug ni estado de
  perfiles existentes.
- [ ] T014 Implementar `control.create_business_profile_complete` y
  `control.update_business_profile_complete` con locks, revisión optimista, activación de asset, validación de
  contraste y auditoría; conservar funciones legacy compatibles.
- [ ] T015 Ampliar `control.publish_business_profile` para validar contraste y asset activo sin romper callers
  legacy.
- [ ] T016 Añadir pruebas SQL/integración para constraints, transición staged→active, expiración, asset ajeno,
  conflicto stale, draft inválido, publicación inválida, RLS, grants y rol de servicio.
- [ ] T017 Ejecutar `supabase migration up --local --yes`, `supabase db lint --local` y las pruebas de DB desde una
  base limpia y otra con datos previos; documentar resultados sin aplicar remoto.
- [ ] T018 Revisar la migración contra las guías de Postgres/Supabase, corregir planes o índices innecesarios y
  crear Conventional Commit enfocado.

## Fase 4 — Servicio de assets en API

- [ ] T019 Implementar validación estructural por bytes de JPEG/PNG/WebP, tamaño, MIME, dimensiones 64–4096,
  máximo 16 megapíxeles y rechazo EXIF/GPS/XMP/chunks textuales en
  `apps/api/src/features/business-profiles/assets.ts`, sin confiar en el nombre del archivo ni prometer decode
  completo del bitstream.
- [ ] T020 Implementar carga admin multipart, subida privada, inserción staged y compensación si falla la fila en
  las rutas/repository de `apps/api/src/features/business-profiles/`.
- [ ] T021 Implementar carga equivalente para manager a través de la fachada de settings, resolviendo el tenant
  desde la membresía y sin aceptar un perfil arbitrario.
- [ ] T022 Implementar preview autenticado común `/dashboard/business-profile-assets/:id/preview` para admin,
  creador o manager del tenant, y lectura pública con referencia publicada, ETag/304, cache, `nosniff` y 404
  indistinguible; no crear una ruta `/admin` paralela.
- [ ] T023 Aplicar límite persistente de 30 intentos de carga/hora por actor con 429/`Retry-After`, además de
  logging estructurado sin bytes, multipart, storage path ni URL firmada.
- [ ] T024 Extender repositorio/rutas admin, manager y públicas para apariencia/avatar usando los tipos y RPC
  completas; derivar todas las URLs de asset en backend.
- [ ] T025 Añadir tests unitarios y HTTP de formatos, estructura, dimensiones, megapíxeles, metadata, compensación,
  rate limit tras reinicio simulado, autorización del preview común, estado, headers, no filtración, stale y
  errores `{ error, message, field? }`.
- [ ] T026 Ejecutar tests y typecheck focalizados de `@42day/api`; crear Conventional Commit enfocado.

## Fase 5 — Editor, carga y preview

- [ ] T027 Extender el cliente de API del dashboard con los contratos tipados de apariencia, carga multipart y
  preview, sin rutas de Storage construidas en cliente.
- [ ] T028 Crear `BusinessProfileAppearanceEditor.tsx` con cuatro controles color+texto, modo de iconos,
  explicaciones de contraste y errores asociados a campo.
- [ ] T029 Implementar selección, preview local, recodificación WebP opcional mediante canvas, alt text y estados
  accesibles de carga/error; respetar formatos originales válidos si canvas no está disponible.
- [ ] T030 Crear `BusinessProfilePreview.tsx` sobre el mismo componente/tokens de representación pública, sin
  persistir cambios durante la edición.
- [ ] T031 Integrar editor y preview en creación y modal de edición, preservando borrador ante errores, cancelando
  sin efectos y refrescando revisión antes de editar un perfil publicado.
- [ ] T032 Conservar confirmación actual→nuevo y conteo de QRs activos cuando cambia imagen o apariencia pública.
- [ ] T033 Integrar los mismos campos en settings del manager sin exponer inventario ni perfiles genéricos.
- [ ] T034 Añadir pruebas de comportamiento para edición, contraste draft/publicado, upload, cancelación, stale,
  teclado, foco, lector de pantalla simulado y ancho 320 px.
- [ ] T035 Ejecutar tests/typecheck/build focalizados de `@42day/dashboard`; crear Conventional Commit enfocado.

## Fase 6 — Página pública canónica

- [ ] T036 Extraer/crear `BusinessProfileView.tsx` como representación compartida por preview y rutas públicas con
  estructura fija, custom properties limitadas y fallback de iniciales.
- [ ] T037 Renderizar avatar, identidad, ubicación y una sola tarjeta por enlace habilitado; confirmar que links
  deshabilitados no llegan al DOM ni a la respuesta pública.
- [ ] T038 Aplicar iconografía según modo, placa neutral para logos oficiales, áreas táctiles de 48 px, foco visible
  y `prefers-reduced-motion`.
- [ ] T039 Integrar la proyección en `/p/:profileSlug` y `/r/:tenantSlug`, demostrando igualdad de apariencia y
  semántica 404 para draft/disabled.
- [ ] T040 Añadir tests de render, snapshot semántico/contractual, avatar ausente/fallido, textos largos, sin links,
  iconos y viewports 320/768/1440.
- [ ] T041 Ejecutar pruebas focalizadas, typecheck y build; crear Conventional Commit enfocado.

## Fase 7 — Evidencia integral y documentación

- [ ] T042 Ejecutar la matriz de `quickstart.md` contra Supabase local, incluyendo RLS, grants, RPC, bucket y
  recorridos admin/manager/público; registrar evidencia reproducible.
- [ ] T043 Actualizar `docs/current-status.md`, `docs/flows/presence-digital.md`, arquitectura backend/frontend,
  integración Supabase, smoke tests y READMEs afectados con comportamiento realmente implementado.
- [ ] T044 Actualizar la documentación de tipos/core y registrar la procedencia de recursos de marca sin copiar
  términos extensos ni afirmar permisos no verificados.
- [ ] T045 Ejecutar `pnpm test`, `pnpm typecheck`, `pnpm build` y `supabase db lint --local`; registrar todo bloqueo u
  omisión sin presentarlo como éxito.
- [ ] T046 Solicitar revisión independiente de `checklists/ux-security.md`; el implementador no marca esos ítems.
- [ ] T047 Ejecutar `$speckit-analyze`, resolver hallazgos en el artefacto dueño con autorización cuando aplique y
  ejecutar `$speckit-converge` hasta que no agregue tareas.
- [ ] T048 Reconciliar esta lista con evidencia y Git; marcar solo tareas demostradas y crear el commit final de
  documentación/cierre.

## Gate posterior, fuera de implementación local

- [ ] T049 Con autorización explícita futura, desplegar a staging, aplicar migración de staging y completar la
  validación física/visual, cinco recorridos cronometrados <3 min, medición p95 con 10 000 perfiles y checklist
  independiente.
- [ ] T050 Con autorización distinta y explícita futura, preparar y ejecutar rollout de producción; nunca inferirla
  de la aprobación de staging o implementación.
