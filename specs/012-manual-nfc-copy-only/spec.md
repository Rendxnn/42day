# Especificación: copia manual como único flujo NFC

**Feature**: `012-manual-nfc-copy-only`
**Creado**: 2026-09-23
**Estado**: listo para revisión e implementación

## Contexto

La configuración rápida ofrece actualmente un handoff a NFC.cool mediante Atajos. La prueba operativa
demostró que esa capacidad depende de un plan pago del proveedor y no puede considerarse una ruta gratuita
para el equipo. ParaHoy debe retirar el acceso visible a aplicaciones externas y conservar únicamente la
copia de la URL permanente, que el operador puede pegar en cualquier escritor NFC elegido por su cuenta.

Este cambio no escribe chips desde el navegador, no interpreta una copia como programación exitosa y no
modifica los hitos físicos. NFC Helper permanece como compatibilidad técnica deshabilitada; no se crean
nuevas sesiones ni se muestra su enlace.

## Clarificaciones

### Sesión 2026-09-23

- No hay ambigüedades críticas pendientes: producto decidió retirar NFC.cool, conservar únicamente
  `Copiar enlace para NFC` y mantener NFC Helper deshabilitado sin borrar su compatibilidad histórica.

## Escenarios y pruebas

### US1 — Copiar la URL permanente (P1)

Como administrador del inventario físico, quiero copiar la URL permanente de una unidad desde la
configuración rápida para escribirla manualmente con la aplicación NFC que tenga disponible.

**Prueba independiente:** abrir una unidad no archivada, copiar el enlace NFC y comparar el texto copiado
con el URL público mostrado y con el contenido del QR.

1. **Dado** un QR disponible, activo o suspendido, **cuando** el administrador usa `Copiar enlace para NFC`,
   **entonces** obtiene exactamente la URL permanente de esa unidad.
2. **Dado** un destino final o perfil configurado, **cuando** copia el enlace, **entonces** no obtiene el
   destino final sino la URL permanente intermedia.
3. **Dado** un fallo del portapapeles, **cuando** intenta copiar, **entonces** recibe un mensaje controlado y
   puede seleccionar manualmente la URL visible.

### US2 — Evitar proveedores externos engañosos (P1)

Como administrador, quiero que el dashboard no presente un proveedor de escritura que exige pago o que no
ha sido certificado, para no confundir abrir una aplicación con escribir correctamente un chip.

**Prueba independiente:** revisar la configuración rápida y comprobar que no hay botones, enlaces de
instalación ni guías operativas de NFC.cool o NFC Helper.

1. **Dado** el flujo normal, **cuando** el administrador abre la sección NFC, **entonces** solo ve la acción
   de copiar y la explicación de verificación física posterior.
2. **Dado** un cliente antiguo que llama el endpoint de handoff, **cuando** intenta crear un handoff nuevo,
   **entonces** recibe una respuesta controlada que indica usar la copia manual y no recibe una URL externa.
3. **Dado** un callback histórico de NFC Helper todavía válido, **cuando** se canjea, **entonces** conserva
   la semántica existente sin habilitar lanzamientos nuevos.

### US3 — Preservar hitos físicos separados (P2)

Como operador, quiero que copiar una URL no marque automáticamente programación, verificación o bloqueo,
para que el inventario refleje únicamente acciones físicas realmente comprobadas.

**Prueba independiente:** copiar, cancelar y repetir la acción y comprobar que destino, revisión, UID y
hitos NFC no cambian.

1. **Dado** cualquier unidad elegible, **cuando** se copia la URL, **entonces** no se persiste una sesión ni
   se modifica la unidad.
2. **Dado** un chip escrito manualmente, **cuando** el operador vuelve al dashboard, **entonces** debe leerlo
   y registrar los hitos mediante las acciones físicas existentes.

### Casos límite

- El navegador niega acceso al portapapeles o exige gesto del usuario.
- La unidad está archivada y continúa visible en un historial: la URL puede mostrarse para auditoría, pero
  no se ofrecen acciones operativas nuevas.
- Un marcador o cliente antiguo conserva un enlace de Atajos: ParaHoy no puede invalidar el marcador, pero
  ya no lo genera ni lo documenta.
- Una sesión de NFC Helper ya expirada o utilizada sigue rechazándose con su error seguro actual.
- El chip está lleno, protegido o bloqueado: el dashboard no intenta diagnosticarlo desde la copia.

## Requisitos

### Requisitos funcionales

- **FR-001**: La configuración rápida DEBE mostrar `Copiar enlace para NFC` como única acción para preparar
  una escritura NFC.
- **FR-002**: La acción DEBE copiar exactamente `unit.publicUrl` y NO DEBE copiar el destino final, perfil,
  tenant, UID, sesión, token ni callback.
- **FR-003**: El dashboard NO DEBE mostrar, abrir ni recomendar NFC.cool, Atajos o NFC Helper.
- **FR-004**: El endpoint histórico de creación de handoff DEBE dejar de generar enlaces externos y DEBE
  responder con un error estable y accionable para clientes antiguos.
- **FR-005**: La ruta de consumo de callbacks NFC Helper PUEDE conservarse únicamente para compatibilidad
  histórica; ninguna UI o endpoint nuevo DEBE crear sesiones NFC Helper.
- **FR-006**: Copiar, fallar o cancelar DEBE dejar sin cambios URL permanente, destino, revisión, UID,
  `nfcProgrammedAt`, `nfcVerifiedAt` y `nfcLockedAt`.
- **FR-007**: Un fallo de portapapeles DEBE mostrar una explicación controlada y mantener la URL visible para
  selección manual.
- **FR-008**: La interfaz DEBE explicar que copiar no prueba una escritura y que los hitos físicos se
  registran solo después de leer el chip.
- **FR-009**: Los contratos compartidos NO DEBEN conservar a NFC.cool como proveedor activo consumible por
  el dashboard.
- **FR-010**: La documentación durable, quickstart y pruebas DEBEN describir la copia manual como único flujo
  soportado y a los proveedores anteriores como deshabilitados.
- **FR-011**: El cambio NO DEBE crear, alterar ni eliminar tablas, filas o migraciones de Supabase.
- **FR-012**: Producción NO DEBE modificarse sin una autorización explícita separada y actual.

### Entidades clave

- **Unidad de enlace dinámico**: conserva código, URL permanente, destino y hitos físicos existentes.
- **Acción de copia NFC**: operación local del navegador sin persistencia ni autoridad sobre el chip.
- **Callback legado de NFC Helper**: compatibilidad de canje para sesiones históricas, no iniciable desde el
  flujo nuevo.

## Criterios de éxito

### Resultados medibles

- **SC-001**: El 100% de las superficies normales de configuración rápida contienen una única acción NFC:
  `Copiar enlace para NFC`.
- **SC-002**: El 100% de las copias exitosas coinciden byte a byte con la URL permanente mostrada.
- **SC-003**: Ninguna copia o intento fallido produce una mutación de unidad, sesión o hito físico.
- **SC-004**: Una llamada de un cliente antiguo al endpoint de creación recibe una respuesta controlada sin
  esquema externo, token o URL de proveedor.
- **SC-005**: Las suites focalizadas de API y dashboard, typecheck y build afectados pasan antes del commit.

## Supuestos

- La escritura NFC real se ejecuta fuera de ParaHoy con una aplicación elegida por el operador.
- El hardware objetivo continúa usando una URL NDEF permanente de ParaHoy.
- NFC Helper permanece en código solo mientras exista la compatibilidad histórica documentada.
- No se certifica ninguna aplicación NFC dentro de esta feature.

## Fuera de alcance

- Seleccionar o integrar otra aplicación NFC.
- Escribir, leer, verificar o bloquear un chip desde el navegador.
- Cambiar formato NDEF, hardware, URL permanente o hitos físicos.
- Eliminar tablas o callbacks históricos.
- Desplegar en staging o producción.
