# Checklist de seguridad y UX: Administración de perfiles y acciones para agentes

**Propósito**: revisión PR de la calidad de requisitos para inventario, modal, retiro y agente  
**Creado**: 2026-09-22  
**Feature**: [spec.md](../spec.md)

**Nota**: estos ítems pertenecen al revisor independiente y no están autoaprobados.

## Completitud

- [ ] CHK001 ¿Están definidos los estados vacío, cargando, error y sin coincidencias del inventario? [Gap, Spec §US1]
- [ ] CHK002 ¿Está especificado qué contexto de lista se conserva tras crear, editar, publicar o deshabilitar? [Completitud, Spec §US2]
- [ ] CHK003 ¿La semántica de “eliminar” está definida consistentemente como deshabilitación en escenarios, requisitos y contrato? [Consistencia, Spec §US3, FR-009]
- [ ] CHK004 ¿La propuesta del agente enumera toda información que el usuario debe revisar antes de confirmar? [Completitud, Spec §US4–US5]

## Claridad y mensurabilidad

- [ ] CHK005 ¿Los campos buscables, filtros, órdenes, tamaños y comportamiento del cursor son explícitos y no ambiguos? [Claridad, FR-001–005]
- [ ] CHK006 ¿“Confirmación inmediatamente anterior” tiene una frontera clara entre prepare y commit? [Claridad, FR-016]
- [ ] CHK007 ¿Los objetivos de 30 segundos, cinco minutos, 800 ms y 10 000 registros se pueden medir con el entorno/evidencia definidos? [Mensurabilidad, SC-001, SC-004, NFR-001]
- [ ] CHK008 ¿La obligación de mostrar impacto de QRs activos define la información mínima y el momento en que debe refrescarse? [Claridad, US3, FR-010]

## Cobertura de escenarios

- [ ] CHK009 ¿Están cubiertos los conflictos concurrentes tanto en el modal como entre prepare y commit? [Cobertura, FR-007, FR-015]
- [ ] CHK010 ¿Están definidos los flujos de recuperación tras pérdida de red antes y después de un commit exitoso? [Cobertura, NFR-004]
- [ ] CHK011 ¿La detección de negocio duplicado define opciones explícitas sin permitir reutilización silenciosa? [Cobertura, Casos límite, US5]
- [ ] CHK012 ¿Están definidos los resultados ante perfil/QR archivado, suspendido, deshabilitado o modificado? [Cobertura, Casos límite]

## Seguridad y privacidad

- [ ] CHK013 ¿Los requisitos distinguen claramente scopes de identidad, rol ParaHoy, audiencia y cliente OAuth? [Consistencia, NFR-002]
- [ ] CHK014 ¿Está especificado qué datos pueden persistirse en la propuesta y cuáles se excluyen de almacenamiento/logs? [Completitud, NFR-003]
- [ ] CHK015 ¿Los requisitos prohíben explícitamente que anotaciones/descripciones MCP sustituyan autorización de servidor? [Seguridad, NFR-002]
- [ ] CHK016 ¿La revocación, expiración, cambio de rol y cruce entre ambientes están cubiertos como escenarios de rechazo? [Cobertura, Casos límite]
- [ ] CHK017 ¿El alcance v1 del agente excluye de forma consistente retiro, NFC, operaciones masivas y SQL genérico? [Consistencia, FR-018, Fuera de alcance]

## Accesibilidad y dependencia externa

- [ ] CHK018 ¿Los requisitos de teclado, foco, lector de pantalla, contraste y 320 px cubren todos los controles del modal y la lista? [Completitud, FR-022]
- [ ] CHK019 ¿Está documentado el fallback operativo si ChatGPT, OAuth o MCP no están disponibles? [Gap, Dependencia]
- [ ] CHK020 ¿La separación de clientes y autorización entre staging/producción está expresada como gate verificable? [Dependencia, Supuestos]

## Notas

- Marcar solo durante revisión de requisitos, no durante pruebas de implementación.
- Toda brecha encontrada debe corregirse en `spec.md` o `plan.md` antes de generar tareas.

