# Especificación: perfiles públicos personalizables

**Feature**: `013-brandable-business-profiles`
**Creado**: 2026-09-23
**Estado**: listo para revisión e implementación

## Contexto

El perfil público canónico ya permite publicar información y enlaces de un negocio, pero usa una apariencia
fija y no muestra una foto o logo propio. ParaHoy necesita que el mismo perfil pueda reflejar la identidad
básica de cada prospecto sin convertirse en un constructor de páginas: la estructura seguirá fija y solo se
personalizarán imagen, colores e iconografía.

La experiencia toma como referencia una tarjeta centrada, con avatar circular, jerarquía clara y enlaces en
tarjetas. Todos los campos deben poder configurarse al crear y editar un perfil, con vista previa inmediata y
las mismas reglas para perfiles genéricos y perfiles vinculados a restaurantes.

## Clarificaciones

### Sesión 2026-09-23

- La estructura será fija; no habrá layouts alternativos.
- Los enlaces aparecerán únicamente como tarjetas, sin una fila social duplicada.
- Existirán dos modos: logos oficiales con color fijo y pictogramas genéricos monocromos recoloreables.
- Un borrador puede guardar colores inaccesibles con advertencia, pero no puede publicarse ni actualizar un
  perfil publicado hasta cumplir contraste WCAG AA.
- La imagen es una única foto o logo circular; sin imagen se muestran iniciales.

## Escenarios y pruebas

### US1 — Visitar un perfil con identidad propia (P1)

Como visitante, quiero reconocer el negocio por su foto, colores y enlaces para decidir rápidamente cómo
contactarlo o abrir su contenido.

**Prueba independiente:** publicar un perfil con foto y paleta propia, abrirlo en móvil y escritorio y
comprobar que mantiene la estructura fija y muestra solo enlaces habilitados.

1. **Dado** un perfil publicado con foto, **cuando** se abre, **entonces** la imagen aparece en el encabezado
   circular con nombre, titular y ubicación.
2. **Dado** un perfil sin foto o con una imagen que no puede cargarse, **cuando** se abre, **entonces** muestra
   iniciales legibles sin desplazar la estructura.
3. **Dado** un conjunto de enlaces activos, **cuando** se muestra el perfil, **entonces** cada uno aparece una
   sola vez como tarjeta con etiqueta e icono.
4. **Dado** un enlace deshabilitado, **cuando** se abre el perfil, **entonces** no se expone en HTML ni en la
   respuesta pública.

### US2 — Personalizar con vista previa (P1)

Como `system_admin`, quiero seleccionar imagen, cuatro colores y modo de iconos al crear o editar un perfil
para poder preparar una página atractiva sin cambiar su estructura.

**Prueba independiente:** crear un borrador, elegir imagen y colores, alternar los dos modos de iconos y
comparar la vista previa con la página pública después de publicar.

1. **Dado** un perfil nuevo o existente, **cuando** cambia un campo visual, **entonces** la vista previa móvil
   se actualiza sin guardar.
2. **Dado** un color escrito o elegido, **cuando** es válido, **entonces** se normaliza y queda reflejado en la
   vista previa.
3. **Dado** un valor inválido, **cuando** intenta guardar, **entonces** recibe un mensaje asociado al campo y
   conserva el resto del borrador.
4. **Dado** un perfil publicado con QRs activos, **cuando** confirma un cambio visual, **entonces** ve el
   impacto y la revisión fresca antes de guardar.

### US3 — Mantener accesibilidad y marca (P1)

Como administrador, quiero saber cuándo una paleta es ilegible y usar logos de marca sin alterarlos para
evitar publicar páginas inaccesibles o representaciones incorrectas.

**Prueba independiente:** guardar un borrador con contraste insuficiente, intentar publicarlo, corregir la
paleta y alternar entre iconos oficiales y monocromos.

1. **Dado** un borrador con contraste insuficiente, **cuando** guarda, **entonces** se conserva con una
   advertencia específica.
2. **Dado** ese borrador, **cuando** intenta publicar, **entonces** la publicación se bloquea hasta corregirlo.
3. **Dado** un perfil ya publicado, **cuando** intenta guardar una paleta inválida, **entonces** no cambia la
   versión pública.
4. **Dado** el modo `Marca`, **cuando** se muestran WhatsApp, Instagram o Google Reviews, **entonces** sus
   recursos oficiales conservan color y proporción.
5. **Dado** el modo `Monocromo`, **cuando** se muestran esos enlaces, **entonces** se usan pictogramas
   genéricos con el color configurado.

### US4 — Editar el perfil vinculado de un restaurante (P2)

Como encargado, quiero editar la apariencia del perfil de mi restaurante desde Ajustes para conservar la
autogestión sin acceder a perfiles ajenos ni al inventario físico.

**Prueba independiente:** editar imagen y paleta como encargado autorizado, luego intentar el mismo cambio
sobre otro tenant y comprobar que se rechaza sin revelar sus datos.

1. **Dado** un perfil canónico vinculado, **cuando** el encargado autorizado lo edita, **entonces** conserva
   `/r/:tenantSlug` y `/p/:profileSlug` con la misma apariencia.
2. **Dado** un tenant ajeno o perfil genérico, **cuando** el encargado intenta acceder, **entonces** recibe
   prohibición sin contenido del perfil.

### Casos límite

- La imagen supera tamaño/dimensiones/píxeles permitidos, declara un MIME falso, tiene estructura truncada,
  contiene EXIF/GPS/XMP/texto embebido o es SVG.
- La carga de imagen termina pero la actualización de perfil entra en conflicto de revisión.
- La imagen anterior sigue referenciada mientras una nueva carga queda preparada sin usar.
- El navegador no puede usar canvas para preprocesar; el backend debe rechazar formatos no válidos sin
  aceptar el MIME declarado como prueba suficiente.
- Un color válido en sintaxis no alcanza contraste contra la tarjeta.
- Un perfil no tiene nombre suficiente para dos iniciales; usa la primera letra disponible.
- Un enlace personalizado no tiene logo de marca; usa siempre pictograma genérico.
- Un asset activo no puede eliminarse mientras algún perfil lo referencia.

## Requisitos

### Requisitos funcionales

- **FR-001**: Todo perfil DEBE tener una apariencia compuesta por color de página, tarjeta, texto, iconos y
  modo de iconos.
- **FR-002**: Los colores DEBEN usar hexadecimal de seis dígitos y normalizarse a mayúsculas.
- **FR-003**: Perfiles existentes DEBEN recibir valores predeterminados compatibles sin quedar inválidos ni
  cambiar slug, estado, revisión o URL.
- **FR-004**: El perfil PUEDE tener una única imagen de encabezado; sin imagen o ante fallo de carga DEBE
  mostrar iniciales derivadas del nombre.
- **FR-005**: La estructura pública DEBE permanecer fija: fondo plano, tarjeta central, avatar circular,
  identidad, ubicación y una columna de tarjetas de enlaces.
- **FR-006**: Cada enlace habilitado DEBE aparecer exactamente una vez y cada enlace deshabilitado DEBE
  permanecer ausente de la proyección pública.
- **FR-007**: El modo `brand` DEBE usar recursos oficiales sin recolorear para WhatsApp, Instagram y Google;
  otros tipos usan pictogramas genéricos.
- **FR-008**: El modo `monochrome` DEBE usar únicamente pictogramas genéricos recoloreados con `iconColor`.
- **FR-009**: Los recursos de marca DEBEN conservar una fuente, versión o fecha y hash documentados.
- **FR-010**: Texto sobre tarjeta DEBE alcanzar 4.5:1; iconos monocromos sobre su superficie DEBEN alcanzar
  3:1.
- **FR-011**: Un borrador con contraste inválido PUEDE guardarse con advertencias, pero NO DEBE publicarse.
- **FR-012**: Un perfil publicado NO DEBE aceptar una actualización que deje la proyección pública con
  contraste inválido.
- **FR-013**: Crear y editar DEBE ofrecer controles de color, modo de iconos, imagen y una vista previa móvil
  que use las mismas reglas de presentación que la página pública.
- **FR-014**: Cambiar apariencia o imagen DEBE incrementar la revisión y participar del conflicto optimista
  existente sin reintento silencioso.
- **FR-015**: La actualización de un perfil publicado DEBE mostrar el conteo de QRs activos antes de pedir
  confirmación actual → nuevo.
- **FR-016**: Solo `system_admin` PUEDE crear o editar perfiles genéricos y cargar sus imágenes.
- **FR-017**: Un encargado PUEDE editar únicamente la apariencia del perfil canónico vinculado a su tenant.
- **FR-018**: El dashboard NO DEBE escribir directamente en tablas ni almacenamiento privilegiado.
- **FR-019**: Las imágenes aceptadas DEBEN limitarse a JPEG, PNG o WebP, máximo 3 MB, dimensiones entre 64 y
  4096 px por lado y máximo 16 megapíxeles; SVG, estructura inválida/truncada y MIME inconsistente DEBEN
  rechazarse.
- **FR-020**: Un asset preparado NO DEBE ser público hasta estar activo y referenciado por un perfil.
- **FR-021**: Un asset activo referenciado NO DEBE borrarse físicamente.
- **FR-022**: Las respuestas de error DEBEN usar código estable, mensaje controlado y campo cuando aplique.
- **FR-023**: La URL pública de la imagen DEBE derivarse en backend; el cliente no construye rutas de Storage
  ni recibe una URL firmada persistente.
- **FR-024**: `/p/:profileSlug` y el alias `/r/:tenantSlug` DEBEN proyectar la misma apariencia canónica.
- **FR-025**: Ningún log operativo DEBE incluir bytes, cuerpo completo, URL firmada o información sensible
  del asset.
- **FR-026**: Producción NO DEBE modificarse sin autorización explícita separada.
- **FR-027**: La carga de assets DEBE limitarse a 30 intentos por hora por actor y responder con error
  controlado sin depender únicamente de memoria del Worker.
- **FR-028**: Las cargas con EXIF, GPS, XMP o chunks textuales embebidos DEBEN rechazarse; los bytes públicos
  no DEBEN exponer esos metadatos.

### Entidades clave

- **Apariencia de perfil**: paleta y modo de iconos versionados junto al perfil.
- **Asset de perfil**: imagen validada con estado preparado o activo y procedencia mínima.
- **Perfil canónico**: fuente de identidad, enlaces, apariencia y revisión.
- **Recurso de marca**: archivo oficial estático del producto con procedencia documentada.

## Criterios de éxito

### Resultados medibles

- **SC-001**: Un administrador completa imagen, paleta y preview de un perfil nuevo en menos de tres minutos
  sin salir del modal.
- **SC-002**: El 100% de las publicaciones y actualizaciones de perfiles publicados cumplen los dos umbrales
  de contraste definidos.
- **SC-003**: Entre 320 px y 1440 px, el perfil conserva una sola columna legible, sin scroll horizontal ni
  controles recortados.
- **SC-004**: El 100% de enlaces habilitados aparece exactamente una vez y ningún enlace deshabilitado se
  expone públicamente.
- **SC-005**: El 100% de intentos de subir formatos, tamaños o firmas inválidos recibe un error controlado y
  no crea un asset activo.
- **SC-006**: Un manager autorizado completa el cambio de apariencia y uno ajeno obtiene prohibición sin
  datos del perfil.
- **SC-007**: API y página pública entregan una respuesta usable p95 inferior a 800 ms en staging con 10 000
  perfiles y assets cacheados.
- **SC-008**: Durante la certificación de staging, un administrador completa cinco recorridos consecutivos de
  imagen, paleta y preview en menos de tres minutos cada uno, sin abandonar el modal.

## Supuestos

- La foto o logo es contenido público del negocio y el operador cuenta con autorización para usarlo.
- No se aceptan SVG cargados por usuarios; los SVG de pictogramas son parte controlada del código.
- La tipografía, radios, tamaños, orden y layout permanecen fijos.
- Los perfiles deshabilitados y borradores conservan la semántica pública existente.
- La edición MCP de estos campos se implementa en feature 014; 013 deja contratos y servicios reutilizables.

## Fuera de alcance

- Gradientes, video, portada, galería, temas animados o layouts alternativos.
- Fuentes personalizadas, CSS arbitrario o HTML de usuario.
- Recorte avanzado, punto focal o editor fotográfico.
- Analítica de visitantes.
- Importación por URL o conversación remota: feature 014.
- Eliminación automática de assets activos o columnas legacy.
- Despliegue en staging o producción.
