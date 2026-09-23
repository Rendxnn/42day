# Especificación: Administración de perfiles y acciones para agentes

**Feature**: `009-profile-management-agent-actions`  
**Estado**: Implementado en la rama `staging`; revisión independiente, OAuth móvil y certificación
externa pendientes
**Fecha**: 2026-09-22

## Propósito

Permitir que un administrador del sistema encuentre y administre los perfiles de negocio ya creados
sin conocer sus identificadores internos, y habilitar un flujo seguro para que un agente autorizado
prepare y ejecute, con confirmación humana, la creación de un negocio y su asignación a un QR.

## Evidencia del estado actual

- La pantalla `Perfiles` ofrece creación y edición, pero para cargar un perfil existente exige pegar
  manualmente su UUID.
- El backend lista como máximo 200 perfiles, ordenados por actualización, sin búsqueda, filtros,
  paginación ni orden configurable.
- Ya existen creación, edición optimista, publicación y deshabilitación con suspensión de QRs.
- No existe una interfaz de herramientas autenticada que permita a ChatGPT o Codex preparar y
  confirmar estas operaciones desde una conversación móvil.

## Actores

- **Administrador del sistema**: administra el inventario completo de perfiles y confirma cambios
  con impacto público.
- **Agente autorizado**: ayuda al administrador a reunir información pública, preparar una propuesta
  y ejecutar únicamente la operación confirmada.
- **Visitante**: consume un perfil publicado o la URL permanente de un QR; no participa en la
  administración.

## Escenarios de usuario y aceptación

### US1 — Encontrar y revisar perfiles existentes (P1)

Como administrador, quiero ver un inventario paginado con búsqueda, filtros y ordenamiento para
encontrar cualquier perfil sin conocer su UUID.

**Aceptación independiente**:

1. Con más de 250 perfiles, una búsqueda encuentra un perfil que no pertenece a la primera página.
2. El administrador puede ordenar por nombre, slug, fecha de creación, fecha de actualización o
   estado, en ambas direcciones.
3. El administrador puede filtrar por estado y distinguir perfiles vinculados a un tenant de los
   perfiles genéricos.
4. La navegación anterior/siguiente no produce duplicados ni omisiones cuando hay empates en el
   campo ordenado.
5. El inventario informa el total coincidente y permite tamaños de página de 25, 50 o 100.

### US2 — Crear y editar desde un modal (P1)

Como administrador, quiero crear o editar un perfil en un modal para conservar el contexto de la
lista y volver al mismo resultado al cerrar.

**Aceptación independiente**:

1. `Crear perfil` abre un modal vacío y una acción por fila abre el mismo modal en modo edición.
2. Antes de editar se obtiene la versión vigente del perfil; los datos de una fila antigua no se
   usan como borrador autoritativo.
3. Cerrar un modal con cambios sin guardar exige una decisión explícita.
4. Un conflicto de revisión no sobrescribe datos ni reintenta silenciosamente; ofrece recargar la
   versión vigente.
5. Guardar conserva la búsqueda, filtros, orden y posición lógica del inventario.
6. El modal es operable con teclado, administra foco de apertura/cierre y funciona desde 320 px.

### US3 — Retirar un perfil de forma segura (P1)

Como administrador, quiero retirar un perfil que ya no debe usarse sin romper silenciosamente QRs,
URLs públicas ni auditoría.

**Aceptación independiente**:

1. La interfaz presenta la acción como `Deshabilitar perfil` y explica que sustituye a un borrado
   físico.
2. Si el perfil no tiene QRs activos, la confirmación muestra el perfil afectado y lo deshabilita.
3. Si tiene QRs activos, la confirmación muestra cuántos serán suspendidos y la operación ocurre de
   forma atómica.
4. Un perfil deshabilitado permanece localizable mediante el filtro correspondiente y conserva su
   historial.
5. No existe una acción de borrado físico en el dashboard ni para el agente.

### US4 — Preparar un negocio desde una conversación móvil (P1)

Como administrador en la calle, quiero compartir con el agente el nombre o ubicación del negocio y
el QR disponible para que prepare una propuesta de perfil con los enlaces públicos encontrados.

**Aceptación independiente**:

1. El agente identifica la cuenta conectada y solo puede continuar si pertenece a un administrador
   del sistema.
2. El agente puede consultar perfiles y una unidad QR exacta, y entregar una propuesta que incluya
   los enlaces normalizados, advertencias, revisiones vigentes y el cambio actual → propuesto.
3. Investigar enlaces públicos no modifica ParaHoy.
4. Los candidatos ambiguos, especialmente Google Reviews, se presentan para confirmación y no se
   sustituyen por una elección automática.
5. La propuesta vence después de diez minutos o al cambiar cualquier entidad involucrada.

### US5 — Confirmar creación y asignación desde el agente (P1)

Como administrador, quiero confirmar en la conversación una propuesta revisada para crear/publicar
el perfil y asignarlo al QR en una única operación segura.

**Aceptación independiente**:

1. El agente solicita confirmación inmediatamente antes de una escritura con impacto público.
2. La confirmación usa la propuesta preparada; no acepta que el agente sustituya silenciosamente
   identificadores, enlaces o revisiones.
3. Crear/publicar el perfil y asignarlo al QR es todo-o-nada.
4. Repetir la misma operación devuelve el resultado anterior y no duplica perfiles, auditoría ni
   asignaciones.
5. Reutilizar el mismo identificador de operación con otra propuesta falla.
6. Si el QR ya está activo, se exige consentimiento específico para modificarlo y se conserva su
   URL permanente.
7. El resultado devuelve identificadores estables, URL pública del perfil y URL permanente del QR,
   sin secretos.

## Casos límite y recuperación

- Cero resultados, texto con tildes o espacios, slugs similares y perfiles con el mismo nombre.
- Inserciones o actualizaciones concurrentes durante la paginación.
- Perfil o QR modificado, archivado, suspendido o deshabilitado entre preparación y confirmación.
- Token vencido, cliente no autorizado, sesión revocada o usuario que perdió el rol administrativo.
- Reintento por pérdida de conectividad después de que la operación sí fue aplicada.
- Negocio ya existente: la propuesta debe señalar coincidencias y nunca crear un duplicado sin
  decisión explícita.
- QR inexistente, archivado o perteneciente a una asociación incompatible.
- Enlace público inválido, inseguro, acortado o con parámetros sensibles.

## Requisitos funcionales

- **FR-001**: El sistema DEBE ofrecer un inventario paginado de perfiles con total coincidente.
- **FR-002**: La búsqueda DEBE cubrir sin distinguir mayúsculas nombre visible, slug, sede y
  dirección.
- **FR-003**: El inventario DEBE filtrar por estado y tipo de asociación, y ordenar por nombre, slug,
  creación, actualización o estado en ambas direcciones.
- **FR-004**: La paginación DEBE usar cursores ligados a búsqueda, filtros, orden, dirección y tamaño
  de página; cambiar cualquiera de ellos DEBE reiniciar la navegación.
- **FR-005**: El inventario DEBE permitir tamaños de 25, 50 y 100, con 25 por defecto.
- **FR-006**: Crear y editar DEBEN ocurrir en un modal que recupere el detalle vigente antes de
  formar un borrador de edición.
- **FR-007**: Toda edición DEBE conservar control optimista por revisión y presentar los conflictos
  sin sobrescritura ni reintento automático.
- **FR-008**: El sistema DEBE advertir antes de descartar cambios locales sin guardar.
- **FR-009**: “Eliminar” DEBE resolverse mediante deshabilitación lógica; no se borrarán físicamente
  perfiles, enlaces, auditoría ni relaciones históricas.
- **FR-010**: Deshabilitar un perfil usado por QRs activos DEBE suspender esos QRs en la misma
  operación o no modificar nada.
- **FR-011**: Solo administradores del sistema PUEDEN listar, crear, editar, publicar, deshabilitar o
  asignar perfiles mediante estas superficies.
- **FR-012**: El sistema DEBE exponer al agente acciones separadas de lectura, preparación y
  confirmación; las lecturas y preparaciones no DEBEN producir escrituras.
- **FR-013**: El agente DEBE poder consultar su cuenta conectada, listar perfiles, obtener un perfil
  y preparar una creación/asignación de negocio.
- **FR-014**: La preparación DEBE validar y normalizar candidatos, detectar coincidencias, consultar
  el QR exacto y devolver un resumen actual → propuesto con advertencias.
- **FR-015**: Una preparación DEBE ser opaca, de un solo propósito, vinculada al actor y cliente,
  expirar en diez minutos e invalidarse cuando cambien las revisiones esperadas.
- **FR-016**: La confirmación DEBE exigir consentimiento humano inmediatamente anterior y aplicar
  creación, publicación y asignación de forma atómica.
- **FR-017**: Toda confirmación DEBE ser idempotente y auditar actor, cliente, fuente agente,
  entidades afectadas y resultado, sin registrar secretos ni cuerpos completos.
- **FR-018**: La primera versión NO DEBE ofrecer al agente acciones para deshabilitar, borrar,
  archivar, bloquear NFC ni realizar operaciones masivas.
- **FR-019**: Los enlaces de Google Reviews DEBEN conservar la preparación y confirmación explícita
  del flujo existente.
- **FR-020**: Las asociaciones a QR DEBEN conservar la URL pública permanente de la unidad.
- **FR-021**: La integración del agente DEBE funcionar desde una conversación móvil sin depender de
  una sesión remota permanente en la computadora del administrador.
- **FR-022**: El inventario y el modal DEBEN ser accesibles por teclado, exponer nombres de controles
  comprensibles y conservar legibilidad a 320 px.
- **FR-023**: Elegir una coincidencia existente durante la confirmación solo DEBE asignar ese perfil
  al QR; no DEBE sobrescribir el perfil existente.

## Requisitos no funcionales

- **NFR-001 Rendimiento**: El 95 % de consultas del inventario con hasta 10 000 perfiles DEBE
  responder en menos de 800 ms medidos en staging, excluyendo latencia de red del cliente.
- **NFR-002 Seguridad**: Cada acción DEBE validar sesión, rol, cliente autorizado, audiencia,
  expiración y permisos en el servidor; las descripciones del agente no sustituyen autorización.
- **NFR-003 Privacidad**: No se registrarán tokens, secretos, parámetros sensibles de URL ni cuerpos
  completos de perfil en logs operativos.
- **NFR-004 Resiliencia**: Una pérdida de conexión después de confirmar DEBE poder recuperarse
  consultando el resultado idempotente.
- **NFR-005 Compatibilidad**: Las rutas públicas `/p/:slug`, los alias `/r/:tenantSlug` y las URLs
  permanentes de QR existentes no cambiarán.

## Entidades clave

- **Resumen de perfil**: representación ligera para inventario, con identidad, nombre, slug, estado,
  asociación, fechas y cantidad de QRs activos.
- **Página de perfiles**: resultados, total coincidente y cursor siguiente.
- **Propuesta de configuración de negocio**: fotografía temporal y opaca del perfil propuesto, QR,
  revisiones, advertencias, actor, cliente y vencimiento.
- **Operación de configuración de negocio**: comando idempotente y su resultado estable.

## Fuera de alcance

- Borrado físico de perfiles o auditoría.
- Autoservicio de inventario para managers.
- Investigación automática de internet ejecutada por el backend de ParaHoy.
- Escritura o bloqueo físico de NFC desde el agente.
- Edición masiva de perfiles o asignación masiva de QRs desde el agente.
- Publicación en producción dentro de este feature sin autorización posterior y específica.

## Supuestos y decisiones adoptadas

- La palabra “eliminar” se implementa como deshabilitación lógica segura y visible.
- ChatGPT realiza la investigación pública con sus capacidades disponibles; ParaHoy valida los
  candidatos y conserva la autoridad sobre las escrituras.
- La integración inicial es privada para administradores del sistema y usa la cuenta ParaHoy ya
  existente.
- El agente puede preparar y confirmar creación/asignación, pero no retirar perfiles.
- Staging y producción tendrán clientes y credenciales separados.

## Criterios de éxito

- **SC-001**: Un administrador encuentra cualquier perfil entre al menos 10 000 registros en menos
  de 30 segundos sin usar un UUID.
- **SC-002**: El 100 % de conflictos concurrentes de edición se detiene sin sobrescribir la versión
  más reciente.
- **SC-003**: El 100 % de retiros conserva el perfil y su auditoría, y ningún QR activo queda
  apuntando silenciosamente a un recurso inaccesible.
- **SC-004**: Desde un teléfono, un administrador completa preparación, revisión, confirmación y
  asignación de un negocio a un QR en menos de cinco minutos, una vez reunidos los enlaces públicos.
- **SC-005**: Reintentar una confirmación aplicada no crea registros ni eventos duplicados.
- **SC-006**: Ninguna acción de escritura del agente se ejecuta sin sesión administrativa válida,
  cliente permitido y confirmación humana reciente.
