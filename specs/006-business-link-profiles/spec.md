# Especificación: perfiles ligeros de negocio

**Feature**: `006-business-link-profiles`
**Creado**: 2026-09-22
**Estado**: planificación aprobada e implementación inicial validada; la migración está aplicada en
staging, pero el código aún no se ha desplegado allí. El checklist conserva tres ítems de revisión
independiente y la certificación funcional de staging permanece pendiente.

## Contexto

El perfil público existente sirve a restaurantes, pero depende de un tenant y una sede. ParaHoy necesita
un perfil de negocio ligero que pueda configurarse rápidamente para un QR/NFC, sin crear un restaurante
completo y sin romper la URL pública ni los ajustes actuales de restaurantes.

El perfil canónico puede estar ligado a un restaurante o ser independiente. Un QR activo conserva siempre
su URL permanente; al apuntar a un perfil, el backend deriva su URL pública, nunca el navegador.

## Clarificaciones

### Sesión 2026-09-22

- No hay ambigüedades críticas pendientes: se aplican los supuestos fijados en el plan maestro aprobado
  por producto, incluidos borrador inicial, publicación en la asignación inicial y administración interna.

## Escenarios y pruebas

### US1 — Crear y publicar un perfil ligero (P1)

Como `system_admin`, quiero crear un negocio en borrador con información básica y enlaces activables para
poder asignarlo con seguridad a un QR/NFC sin aprovisionar un restaurante.

**Prueba independiente:** crear un perfil genérico con enlaces deshabilitados, activar solo dos, publicarlo
y comprobar que su URL pública muestra únicamente esos dos enlaces.

1. El perfil nace en borrador y no es público.
2. El administrador puede guardar nombre, titular, lugar, dirección y enlaces estándar o personalizados.
3. Guardar un enlace no lo publica: cada enlace tiene un estado visible independiente.
4. La publicación usa un slug estable; si el nombre colisiona, el sistema propone un sufijo disponible.
5. Un QR solo recibe el destino de perfil a través de la URL canónica derivada en backend.

### US2 — Mantener un perfil de restaurante compatible (P1)

Como `encargado`, quiero seguir editando el perfil público de mi restaurante desde Ajustes mientras ParaHoy
adopta el perfil canónico, para no perder mis datos ni mi URL existente.

**Prueba independiente:** migrar un restaurante con sede activa, editar un enlace desde Ajustes y comprobar
que el perfil canónico y los campos legacy siguen alineados; `/r/:tenantSlug` conserva el resultado público.

1. Cada restaurante elegible recibe como máximo un perfil canónico a partir de su primera sede activa.
2. La fachada actual de Ajustes sigue aceptando el contrato existente durante el rollout.
3. Un encargado solo lee y escribe el perfil vinculado al tenant donde tiene rol `encargado` activo.
4. El perfil de un negocio genérico no habilita acceso a schemas de restaurantes.

### US3 — Resolver enlaces seguros y visibles (P1)

Como visitante, quiero abrir una página pública clara para un negocio y ver solo enlaces que el negocio decidió
mostrar.

**Prueba independiente:** consultar un borrador, un perfil deshabilitado y un publicado; los dos primeros
dan 404 y el publicado devuelve únicamente enlaces habilitados, ordenados y válidos.

1. Los tipos disponibles son carta, reseña de Google, Instagram, TikTok, web, WhatsApp, teléfono, Facebook,
Maps, encuesta y enlace personalizado.
2. Enlaces web deben ser HTTPS públicos; WhatsApp y teléfono se normalizan antes de guardarse.
3. Una reseña Google sigue usando preparación y confirmación visual antes de persistirse.
4. La carta de un restaurante se deriva de su slug; la de un perfil genérico usa una URL HTTPS validada.

### US4 — Deshabilitar sin dejar QRs activos rotos (P1)

Como `system_admin`, quiero deshabilitar un perfil solo mediante una operación consciente que suspenda sus QRs
activos, para no dejar enlaces físicos apuntando silenciosamente a un 404.

**Prueba independiente:** asociar dos QRs activos a un perfil publicado, intentar deshabilitarlo y comprobar
que la operación ordinaria falla; usar la operación explícita y comprobar que ambos QRs quedan suspendidos,
con auditoría individual y sin URL permanente modificada.

1. Un perfil no se elimina físicamente.
2. Deshabilitar sin QRs activos es explícito y reversible solo creando/publicando una configuración válida.
3. Si existen QRs activos, solo `disable-and-suspend` puede deshabilitar y suspender todo en una transacción.
4. Un fallo de revisión, elegibilidad o persistencia no deja un subconjunto de QRs suspendido.

## Requisitos funcionales

- **FR-001:** cada perfil tiene slug único, estado `draft`, `published` o `disabled`, revisión optimista,
  identificador idempotente de creación y relación opcional uno-a-uno con un tenant.
- **FR-002:** el slug se deriva del nombre, resuelve colisiones y no cambia después de publicar.
- **FR-003:** el perfil expone nombre, titular, lugar, dirección y una colección ordenada de enlaces con
  tipo, etiqueta, valor y visibilidad independiente.
- **FR-004:** el backend valida y normaliza cada tipo de enlace antes de guardar; no registra valores
  completos de enlace ni cuerpos de perfil en logs operativos.
- **FR-005:** los perfiles `draft` y `disabled` no son resolubles públicamente.
- **FR-006:** las rutas públicas canónicas usan `/p/:profileSlug`; `/r/:tenantSlug` conserva el resultado
  compatible del perfil de restaurante migrado.
- **FR-007:** solo `system_admin` crea perfiles independientes, publica, asocia QRs o administra perfiles
  sin tenant; `encargado` edita únicamente el perfil vinculado a su restaurante.
- **FR-008:** el backfill crea perfiles para restaurantes elegibles sin borrar columnas legacy y las
  escrituras posteriores mantienen ambos modelos compatibles durante el rollout.
- **FR-009:** `destinationType: "profile"` exige un `profileId`; el backend deriva el destino y limpia la
  asociación tenant de una unidad cuando el perfil es genérico.
- **FR-010:** las ediciones usan revisión esperada y nunca reintentan automáticamente un conflicto.
- **FR-011:** la deshabilitación es terminal en este alcance; con QRs activos suspende todas las unidades
  afectadas y registra una
  auditoría por unidad en la misma operación atómica.
- **FR-012:** los contratos de perfil compartidos viven en `@42day/types`; el dashboard usa API autorizada,
  no consultas directas a `control`.

## Casos límite

- Un slug ya existente no puede sobrescribir otro perfil; el cliente recibe una alternativa o un conflicto
  controlado.
- Un QR archivado no cambia durante la deshabilitación; uno activo con revisión distinta aborta toda la
  operación.
- Un perfil vinculado sin sede activa conserva sus datos, pero no inventa una carta ni una dirección.
- Rehabilitar un perfil deshabilitado queda fuera de este alcance; se crea un perfil nuevo si el negocio
  vuelve a operar.
- Una actualización de perfil publicada informa cuántos QRs activos la consumen antes de aplicar cambios.
- Un manager que intenta acceder a otro tenant recibe `forbidden`, no datos de ese perfil.

## Fuera de alcance

- Aplicar un perfil o redirección a múltiples QRs: feature 007.
- Escritura de chips, callback de NFC Helper y certificación física: feature 008.
- Eliminar columnas legacy, borrar perfiles, analytics de visitantes o cambios en producción.

## Criterios de éxito

- Un administrador puede crear un perfil básico, dejar enlaces preparados pero ocultos y publicar una
  página segura sin crear un restaurante.
- Un restaurante existente conserva su URL `/r/:tenantSlug` y su configuración durante la migración.
- Ninguna deshabilitación deja un QR activo apuntando a un perfil inaccesible.
- Los flujos de creación, edición, publicación, compatibilidad y deshabilitación tienen pruebas de
  comportamiento y evidencia de aislamiento de autorización.

## Supuestos

- Los perfiles nacen en borrador y la publicación inicial de un flujo QR se confirma con la asignación
  final; la publicación administrativa explícita sigue disponible para preparación controlada.
- El inventario físico sigue siendo exclusivo de `system_admin`.
- Las URLs legacy y sus columnas se mantienen hasta un rollout posterior aprobado.
