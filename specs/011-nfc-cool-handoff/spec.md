# Especificación: handoff NFC.cool en iPhone

**Feature Branch**: `011-nfc-cool-handoff`  
**Creada**: 2026-09-23  
**Estado**: Aprobada para implementación  
**Entrada**: Activar NFC.cool como proveedor de escritura NFC desde el dashboard mediante Atajos de iPhone, conservando NFC Helper deshabilitado y el fallback manual.

## Contexto

El adaptador actual de NFC Helper puede recibir una URL y retornar al dashboard, pero durante la prueba física corta la URL escrita en algunos chips. ParaHoy debe ofrecer NFC.cool como adaptador operativo sin perder la URL permanente, el fallback manual ni los hitos físicos separados. NFC Helper queda conservado como adaptador legado, pero no debe ser seleccionable ni invocado por el dashboard mientras esté deshabilitado.

La escritura desde un navegador no puede usar el sensor NFC de iPhone. NFC.cool recibe la URL permanente a través de un Atajo instalado previamente en el iPhone. El toque físico del chip sigue siendo indispensable.

## User Scenarios & Testing

### User Story 1 - Programar con NFC.cool (Priority: P1)

Como administrador del inventario, quiero abrir NFC.cool con la URL permanente de la unidad ya cargada para programar un chip sin copiar ni editar manualmente el enlace.

**Why this priority**: Es el flujo operativo que sustituye al proveedor con fallas sin cambiar la identidad física del QR/NFC.

**Independent Test**: Con una unidad activa, el dashboard entrega un enlace de Atajos que pasa exactamente su URL permanente al atajo configurado de NFC.cool y no incluye el destino final, datos de sesión ni tokens.

**Acceptance Scenarios**:

1. **Given** una unidad no archivada con URL permanente, **When** el administrador selecciona `Escribir con NFC.cool`, **Then** se abre el Atajo de iPhone configurado para escribir NFC y recibe exactamente la URL permanente de esa unidad.
2. **Given** una unidad cuyo destino público cambió, **When** se inicia el handoff, **Then** el contenido enviado al Atajo sigue siendo la misma URL permanente de la unidad.
3. **Given** que el Atajo o NFC.cool no están instalados, **When** el administrador no puede abrir el handoff, **Then** puede copiar la URL permanente y ver instrucciones claras de instalación y configuración única.

---

### User Story 2 - Conservar operación segura (Priority: P1)

Como administrador, quiero que el cambio de proveedor no convierta una señal externa en verificación o bloqueo físico del chip.

**Why this priority**: Una aplicación externa no demuestra que el material escrito corresponde al chip ni que este fue bloqueado físicamente.

**Independent Test**: Iniciar o cancelar el handoff no modifica `NFC programado`, `NFC verificado`, `NFC bloqueado físicamente`, UID ni destino de la unidad.

**Acceptance Scenarios**:

1. **Given** una unidad elegible, **When** el administrador inicia, cancela o termina el Atajo, **Then** el dashboard no registra automáticamente ningún hito NFC ni UID.
2. **Given** una unidad archivada, **When** se intenta iniciar el handoff, **Then** la operación es rechazada y no se entrega ningún enlace de escritura.
3. **Given** que NFC Helper quedó deshabilitado, **When** el administrador utiliza el flujo normal, **Then** no se muestra, genera ni abre un enlace de NFC Helper.

---

### User Story 3 - Preparar el iPhone una sola vez (Priority: P2)

Como administrador con iPhone, quiero instrucciones precisas para crear el Atajo requerido y poder volver a usarlo desde ParaHoy con un toque inicial.

**Why this priority**: El navegador no puede crear el atajo ni escribir NFC directamente; una preparación explícita evita que el operador confunda una instalación incompleta con una falla del QR.

**Independent Test**: La guía explica la instalación de NFC.cool, el nombre canónico del Atajo, la acción `Write NFC`, la entrada de URL, el fallback manual y la verificación posterior.

**Acceptance Scenarios**:

1. **Given** un iPhone sin el Atajo configurado, **When** el administrador abre la ayuda desde el dashboard, **Then** puede completar la configuración única sin recibir secretos, tokens ni URLs de destino final.
2. **Given** el Atajo instalado con el nombre canónico, **When** el dashboard lo abre, **Then** recibe la URL como texto codificado correctamente incluso si incluye caracteres que requieran escape.

### Edge Cases

- El navegador puede no abrir `shortcuts://` porque Atajos no existe, está restringido o el nombre del Atajo fue cambiado; el flujo debe conservar copiar URL e instrucciones de recuperación.
- NFC.cool puede no estar instalado o su acción de Atajos puede no estar disponible por plan, versión o configuración del operador; no se debe reportar una escritura ni modificar estado.
- Un valor de URL mal codificado, duplicado o distinto de la URL permanente debe bloquearse antes de que el dashboard entregue el handoff.
- El chip puede rechazar escritura, estar lleno, ya bloqueado o recibir una escritura incompleta; esto requiere lectura física posterior y no puede resolverse desde el dashboard.
- NFC Helper permanece en el código legado por compatibilidad técnica, pero su enlace no se expone mientras la selección activa sea NFC.cool.

## Requirements

### Functional Requirements

- **FR-001**: El sistema DEBE tratar NFC.cool como el proveedor de handoff NFC activo para el dashboard.
- **FR-002**: El sistema DEBE construir el handoff de NFC.cool mediante el esquema de Atajos de iPhone y pasar la URL permanente de la unidad como texto codificado una sola vez.
- **FR-003**: El handoff DEBE aceptar únicamente unidades no archivadas y DEBE rechazar una unidad archivada sin producir una URL externa.
- **FR-004**: El sistema NO DEBE incluir bearer tokens, identificadores de sesión, correo, tenant ni destino final en el enlace de NFC.cool.
- **FR-005**: El sistema DEBE conservar el adaptador de NFC Helper en el código, pero DEBE mantenerlo deshabilitado: el flujo normal no puede mostrarlo, seleccionarlo ni invocarlo.
- **FR-006**: El dashboard DEBE conservar `Copiar enlace para NFC` y ofrecer una guía de preparación única con el nombre canónico `Escribir NFC ParaHoy`, la acción `Write NFC` de NFC.cool y la verificación física posterior.
- **FR-007**: Iniciar, abandonar o completar el handoff DEBE dejar sin cambios la URL permanente, destino, UID y los hitos `NFC programado`, `NFC verificado` y `NFC bloqueado físicamente`.
- **FR-008**: El dashboard DEBE comunicar que NFC.cool/Atajos no confirman la escritura y que el operador debe leer el chip y registrar los hitos físicos por separado.
- **FR-009**: La documentación durable y el quickstart DEBEN identificar NFC.cool como adaptador activo, NFC Helper como legado deshabilitado y el spike físico pendiente como gate externo.

### Key Entities

- **Proveedor de handoff NFC**: Adaptador que transforma una URL permanente en un enlace para una aplicación externa, sin autoridad sobre hitos físicos.
- **Atajo `Escribir NFC ParaHoy`**: Atajo instalado por el operador que recibe una URL como texto y delega la escritura a NFC.cool.
- **Unidad de enlace dinámico**: Unidad física que posee una URL permanente y conserva sus hitos NFC de forma independiente del handoff.

## Success Criteria

### Measurable Outcomes

- **SC-001**: En el dashboard, el 100% de handoffs iniciados para unidades no archivadas contienen exactamente la URL permanente de la unidad y ningún token, sesión, tenant ni destino final.
- **SC-002**: El flujo visible ofrece una única acción NFC.cool, un fallback de copia y una guía de preparación sin referencias operativas a NFC Helper.
- **SC-003**: En una prueba de 20 escrituras y lecturas físicas con el iPhone objetivo y chips NTAG213, cada URL leída coincide byte a byte con la URL permanente entregada por el dashboard antes de certificar el proveedor.
- **SC-004**: Ningún inicio, cancelación o retorno del handoff modifica automáticamente un hito NFC, UID, destino o URL permanente.

## Assumptions

- El operador usa iPhone con Atajos y NFC.cool instalados; la preparación del Atajo es una acción única fuera de ParaHoy.
- El nombre canónico del Atajo es `Escribir NFC ParaHoy`; renombrarlo puede impedir que el enlace del dashboard lo abra.
- El plan o versión de NFC.cool disponible para el operador expone la acción `Write NFC` a Atajos; la compatibilidad física se certifica aparte.
- No se modifican tablas ni migraciones: este cambio altera únicamente el adaptador y experiencia de handoff.
- NFC Helper no se elimina y puede reactivarse solo mediante un cambio explícito y una nueva validación física.

## Fuera de alcance

- Crear, instalar o suscribir automáticamente NFC.cool o un Atajo en el iPhone del operador.
- Confirmar desde el navegador que un chip fue escrito, leído, verificado o bloqueado.
- Cambiar la URL permanente, el formato NDEF, el hardware NFC o los contratos de operaciones masivas.
- Publicar cambios en producción.
