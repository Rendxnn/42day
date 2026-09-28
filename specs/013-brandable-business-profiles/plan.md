# Plan de implementación: perfiles públicos personalizables

**Feature**: `013-brandable-business-profiles`
**Especificación**: `specs/013-brandable-business-profiles/spec.md`
**Dependencia**: `006-business-link-profiles` implementada; `012-manual-nfc-copy-only` cerrada antes de iniciar
**Estado**: listo para descomponer e implementar por fases

## Objetivo técnico

Extender el perfil canónico existente con una apariencia versionada y un único avatar administrado por el
backend. El dashboard ofrecerá edición y vista previa con el mismo modelo de presentación que consume la
página pública. La solución no introduce un constructor libre: conserva una estructura fija y valida
contraste, tipos de archivo, aislamiento de tenant y revisión optimista en el servidor.

## Decisiones cerradas

1. La apariencia se almacena en `control.business_profiles`; no habrá tabla de temas ni JSON libre.
2. La imagen se almacena en un bucket privado y se representa en `control.business_profile_assets`.
3. Los assets cargados por usuarios solo pueden ser JPEG, PNG o WebP y medir como máximo 3 MiB.
4. Los SVG de iconos son recursos versionados del repositorio; nunca se acepta SVG aportado por el usuario.
5. La página pública no recibe rutas de Storage ni URLs firmadas persistentes; consume un endpoint del API.
6. La estructura visual es única: tarjeta central, avatar circular, identidad y tarjetas de enlaces.
7. No existe fila social adicional. Todo enlace visible aparece exactamente una vez.
8. `brand` conserva los colores de los logos oficiales de WhatsApp, Instagram y Google. `monochrome` usa
   pictogramas genéricos controlados por `iconColor`.
9. Un draft puede conservar una paleta de bajo contraste con advertencia. Publicar o actualizar un perfil ya
   publicado con esa paleta está prohibido en backend.
10. La creación y actualización completa usarán RPC nuevas. Las RPC anteriores se conservan para rollback y
    aplican valores predeterminados.
11. No se agregan dependencias de producción. El cálculo WCAG, la validación binaria y la representación usan
    utilidades propias y capacidades ya presentes.
12. La importación remota de una imagen por URL pertenece a `014-parahoy-remote-field-agent`.

## Arquitectura futura

```text
Dashboard admin / settings
  ├── editor de identidad, links y apariencia
  ├── carga multipart de avatar
  └── preview que comparte reglas visuales
                │ API autenticada
                ▼
features/business-profiles
  ├── validación de apariencia y contraste
  ├── validación de imagen por bytes
  ├── orquestación Storage + repositorio
  └── autorización system_admin / tenant manager
                │ service_role + RPC
                ▼
control.business_profiles ── avatar_asset_id ── control.business_profile_assets
                │                                  │
                └──────── proyección pública ──────┘
                                   │
                         bucket privado + endpoint cacheable
```

## Responsabilidades por módulo

### `packages/types`

- Definir `BusinessProfileAppearance`, `BusinessProfileIconMode`, `BusinessProfileAvatar` y errores estables.
- Extender los contratos existentes de creación, detalle, resumen, actualización y lectura pública.
- Mantener nombres camelCase en TypeScript; la traducción snake_case queda en repositorio/RPC.
- Centralizar el copy español de validaciones para evitar códigos crudos en UI.

### `packages/core`

- Normalizar hex de seis dígitos a mayúsculas.
- Calcular luminancia relativa y relación de contraste WCAG sin DOM.
- Validar los umbrales 4.5:1 para texto y 3:1 para icono monocromo.
- Derivar iniciales estables desde `displayName`.
- Devolver resultados puros y testeables; no conocer HTTP, Supabase ni React.

### `apps/api`

- Autorizar todas las escrituras según rol y tenant.
- Parsear multipart con límites antes de conservar bytes.
- Verificar firma, estructura, dimensiones/píxeles, metadata prohibida y MIME permitido; no confiar solo en
  extensión o header.
- Guardar el objeto bajo una ruta no predecible derivada de ID/hash y crear el asset como `staged`.
- Activar el asset únicamente dentro de la actualización transaccional del perfil.
- Servir previews autenticados con cache privado y assets públicos solo si están activos y referenciados por un
  perfil publicado.
- Delegar mutaciones completas a RPC con revisión optimista y auditoría existente.

### `apps/dashboard`

- Incorporar controles de avatar, cuatro colores y modo de iconos al modal de crear/editar.
- Usar `input[type=color]` más input textual normalizado; mostrar errores junto al campo.
- Mantener un borrador local y preview inmediato sin mutar el perfil hasta guardar.
- Preprocesar archivos compatibles a WebP mediante canvas cuando el navegador lo permita; el servidor sigue
  siendo la autoridad y acepta JPEG/PNG/WebP válidos sin depender del preprocesamiento.
- Reutilizar un componente de presentación entre preview y página pública para impedir divergencia visual.
- Conservar el diálogo actual de impacto y revisión fresca para perfiles publicados con QRs activos.

### Supabase

- Migración única y reversible en código para tabla, columnas, constraints, índices, bucket y RPC.
- RLS forzado y grants revocados para `public`, `anon` y `authenticated`.
- `service_role` como único actor de datos; el dashboard nunca usa acceso directo.
- RPC `security invoker`, `search_path = ''`, locks breves y comprobación de revisión.
- No eliminar columnas, funciones ni datos legacy en esta feature.

## Cambios de datos

### Migración

Crear con:

```bash
supabase migration new brandable_business_profiles
```

La migración debe ejecutar en este orden:

1. Crear enum/check de estados de assets y tabla `control.business_profile_assets`.
2. Activar y forzar RLS; revocar grants públicos y conceder solo al rol de servicio donde corresponda.
3. Añadir columnas de apariencia y `avatar_asset_id` con defaults y constraints.
4. Backfill de defaults sin incrementar `revision`, `updated_at` ni cambiar la publicación.
5. Crear el bucket privado `business-profile-assets` idempotentemente y fijar límites/MIME.
6. Crear índices por referencia, estado/expiración y hash.
7. Crear RPC completas y ampliar la validación de publicación.
8. Añadir comentarios SQL que documenten seguridad y ciclo de vida.

### Atomicidad entre Storage y Postgres

Storage y Postgres no comparten transacción. Se usa este protocolo:

1. API valida los bytes.
2. API genera `assetId`, hash y ruta, sube el objeto privado.
3. API inserta asset `staged` con vencimiento de 24 horas.
4. Guardar perfil llama RPC con `avatarAssetId`; la RPC bloquea perfil y asset, verifica propietario/estado/
   expiración, actualiza perfil y marca asset `active` atómicamente en Postgres.
5. Si falla el paso 3, API elimina el objeto recién creado.
6. Si falla el paso 4, el asset queda `staged` y es recuperable/reutilizable hasta vencer.
7. Un mantenimiento posterior podrá marcar/eliminar huérfanos; ese job no forma parte del alcance.

El asset anterior permanece `active`; no se elimina automáticamente porque puede seguir referenciado o ser
necesario para rollback operativo.

## Contratos HTTP

Los contratos normativos están en `contracts/`:

- `business-profile-appearance-api.md`
- `business-profile-assets-api.md`
- `public-profile-rendering.md`

El parser multipart debe rechazar temprano cuerpos que excedan 3.25 MiB. Para archivos aceptados, el tamaño
de contenido es máximo 3 MiB. Validadores acotados recorren la estructura JPEG/PNG/WebP, comprueban longitudes,
dimensiones de 64–4096 px, máximo 16 megapíxeles y rechazan EXIF/GPS/XMP/chunks textuales. No se promete una
decodificación completa del bitstream comprimido sin una librería; cualquier fallo residual al renderizar usa
iniciales y no expone datos sensibles.

## Recursos de iconos

Crear un manifiesto versionado, por ejemplo
`apps/dashboard/src/features/business-profiles/brand-icons/manifest.ts`, que incluya por recurso:

- `kind`;
- nombre de marca;
- URL oficial de origen;
- fecha de consulta;
- nombre/licencia o condiciones publicadas;
- SHA-256 del archivo conservado;
- ruta local y dimensiones/viewBox.

Antes de incorporar cada archivo, el implementador debe obtenerlo de una fuente oficial y registrar la
evidencia. No se redibuja, recolorea, recorta ni combina el logo oficial. Los pictogramas monocromos se
implementan como componentes SVG propios o de la librería ya instalada, con `currentColor`.

## Representación y accesibilidad

- El componente compartido recibe únicamente la proyección pública más un modo `preview`.
- Los estilos se exponen como custom properties limitadas a los cuatro colores validados; nunca se inyecta
  CSS libre.
- La tarjeta usa ancho `min(560px, calc(100vw - 24px))` y no depende de viewport fijo.
- Cada enlace tiene área táctil mínima de 48 px, foco visible y nombre accesible.
- El avatar usa `altText`; el fallback de iniciales tiene etiqueta accesible equivalente.
- Los logos de marca se colocan sobre una placa neutral fija aprobada. El color configurable no los afecta.
- La UI muestra la relación de contraste calculada y una explicación concreta para cada combinación inválida.

## Seguridad

- Autorización antes de consultar IDs para no filtrar existencia.
- Nombre del archivo aportado por usuario no participa en la ruta de Storage ni en headers de respuesta.
- `Content-Disposition: inline` con nombre constante, `X-Content-Type-Options: nosniff` y CSP existente.
- La respuesta pública solo sirve assets activos referenciados por perfiles publicados.
- El preview autenticado común `/dashboard/business-profile-assets/:id/preview` requiere `system_admin`, la
  misma identidad creadora o autoridad sobre el tenant cuyo perfil lo referencia.
- Logs estructurados solo contienen actor, asset ID, tamaño, MIME validado, resultado y error estable.
- No se registran bytes, multipart, paths completos, URLs firmadas ni metadatos de imagen.
- Los endpoints conservan límites de request del API; una fuente persistente añade 30 intentos de carga/hora
  por actor y responde `429`/`Retry-After`, sin depender solo de memoria del Worker.

## Rendimiento

- La lectura pública obtiene perfil, apariencia, avatar y links en una consulta/repositorio acotado.
- El endpoint de asset usa `ETag` igual al hash entre comillas y cache inmutable por ID de asset.
- Cambiar avatar produce un nuevo ID/URL, por lo que no requiere purgar caches.
- Índices: `business_profiles(avatar_asset_id)`, `business_profile_assets(status, expires_at)` y hash.
- La medición de 10 000 perfiles se hace en staging; no se afirma el p95 antes de medirlo.

## Estructura de archivos prevista

```text
packages/types/src/business-profiles.ts
packages/core/src/business-profile-appearance.ts
packages/core/src/business-profile-appearance.test.ts
apps/api/src/features/business-profiles/
  assets.ts
  assets.test.ts
  repository.ts
  routes.ts
  validation.ts
apps/api/src/features/public-profile/
  repository.ts
  routes.ts
apps/dashboard/src/features/business-profiles/
  BusinessProfileAppearanceEditor.tsx
  BusinessProfileAppearanceEditor.test.tsx
  BusinessProfilePreview.tsx
  BusinessProfileView.tsx
  brand-icons/
    manifest.ts
    *.svg
supabase/migrations/<timestamp>_brandable_business_profiles.sql
specs/013-brandable-business-profiles/
```

Los nombres se ajustarán a la estructura real encontrada al implementar, conservando estas responsabilidades.
No se crearán módulos duplicados si ya existe un dueño equivalente.

## Estrategia de pruebas

### Unitarias

- Normalización y rechazo de colores.
- Luminancia, contraste y límites exactos 4.5/3.0.
- Iniciales con espacios, Unicode y nombres vacíos.
- Firma/tamaño/MIME de imágenes y errores controlados.
- Selección de icono por tipo y modo.
- Proyección que excluye enlaces deshabilitados.

### API e integración

- Autorización system_admin/manager/tenant ajeno.
- Carga válida, preview, activación, expiración y asset no referenciado.
- Revisión stale sin pérdida de la imagen previa.
- Draft inválido guardable; publicación y edición publicada inválidas rechazadas.
- Alias `/r` y canónico `/p` con apariencia idéntica.
- RLS, grants, bucket privado, constraints y RPC contra Supabase local real.
- ETag/304/cache/nosniff y 404 indistinguible.

### Frontend y accesibilidad

- Preview cambia sin guardar y coincide con el componente público.
- Errores ligados a campos, estado de carga y recuperación ante fallo.
- Teclado, lector de pantalla, foco, contraste de controles y 320 px.
- Cada link habilitado una vez; ninguno deshabilitado en DOM.
- Modo marca no recibe `iconColor`; monocromo sí.

### Gates de repositorio

Ejecutar pruebas focalizadas por fase y, antes del cierre:

```bash
pnpm test
pnpm typecheck
pnpm build
supabase db lint --local
```

Los tests que inspeccionan source no sustituyen pruebas de comportamiento. La checklist de UX/seguridad debe
ser revisada por una persona distinta del implementador.

## Rollout y rollback

1. Implementar y probar con Supabase local.
2. Crear un Conventional Commit al cerrar cada fase significativa verificada.
3. Con autorización posterior, aplicar migración en staging y desplegar API/dashboard compatibles.
4. Verificar backfill, permisos, carga, publicación, `/p`, `/r` y caché.
5. Medir rendimiento y completar checklist externa.
6. Producción exige otra autorización explícita y un backup/plan de reversión comprobado.

Rollback de código: las RPC y columnas anteriores permanecen; clientes anteriores ignoran campos nuevos y los
defaults mantienen un perfil válido. La migración de datos no se revierte destructivamente. Un rollback de
aplicación no elimina assets, columnas ni bucket.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Divergencia preview/público | Componente y tokens compartidos; contract tests. |
| Archivo disfrazado o malicioso | Firma/estructura, dimensiones, metadata, MIME allowlist, sin SVG, `nosniff`. |
| Objeto subido sin fila/uso | Compensación inmediata o estado staged con expiración. |
| Asset filtrado desde Storage | Bucket privado sin policies cliente; proxy autorizado. |
| Publicación ilegible | Validación pura compartida y autoridad final en RPC/backend. |
| Logos incorrectos o recoloreados | Manifiesto con procedencia/hash y revisión humana. |
| Conflicto al cambiar avatar | Revisión optimista; asset staged reutilizable, sin reintento silencioso. |
| Rollback rompe perfiles | Defaults persistidos, RPC legacy conservadas, sin drops. |

## Mapeo requisito → evidencia

| Requisitos | Evidencia principal |
| --- | --- |
| FR-001–FR-003 | Migración local, backfill y tests de tipos/repositorio. |
| FR-004–FR-008 | Tests del componente compartido y recorrido público. |
| FR-009 | Manifiesto revisado con fuente, fecha y hash. |
| FR-010–FR-012 | Tests core en límites y pruebas API/RPC de publicación. |
| FR-013–FR-015 | Tests del modal, preview, revisión stale e impacto QR. |
| FR-016–FR-018 | Integración de autorización y ausencia de cliente privilegiado. |
| FR-019–FR-023, FR-028 | Matriz de assets/metadata, RLS/grants y headers HTTP. |
| FR-024 | Contract test comparando `/r` y `/p`. |
| FR-025–FR-027 | Inspección de logs, rate limit persistente y gates operativos documentados. |

## Condición de terminado

La feature solo termina cuando los requisitos tienen pruebas, las migraciones pasan en Supabase local, la
documentación durable refleja el comportamiento, no quedan tareas abiertas, `speckit-analyze` no reporta
bloqueos y `speckit-converge` no agrega trabajo pendiente. Staging y producción no son parte de este cierre.
