# Checklist de seguridad y compatibilidad: copia manual NFC

**Purpose**: gate de revisión independiente antes de implementar o desplegar
**Created**: 2026-09-23
**Feature**: [spec.md](../spec.md)

## Completitud

- [ ] CHK001 ¿La especificación distingue claramente copiar, programar, verificar y bloquear físicamente? [Spec §FR-006–008]
- [ ] CHK002 ¿Está definido que solo la URL permanente puede llegar al portapapeles? [Spec §FR-002]
- [ ] CHK003 ¿Está cubierta la recuperación cuando el portapapeles falla? [Spec §FR-007]

## Compatibilidad

- [ ] CHK004 ¿El contrato define el resultado de clientes antiguos sin reactivar NFC.cool? [Spec §FR-004]
- [ ] CHK005 ¿La compatibilidad Helper queda limitada a sesiones históricas y sin creación nueva? [Spec §FR-005]
- [ ] CHK006 ¿La condición futura para retirar Helper está documentada sin convertirla en trabajo implícito? [Research §Preservar]

## Seguridad y evidencia

- [ ] CHK007 ¿Los requisitos prohíben tokens, destinos y datos de tenant en la acción NFC? [Spec §FR-002]
- [ ] CHK008 ¿Está definida evidencia observable de cero mutaciones? [Spec §SC-003]
- [ ] CHK009 ¿Staging y producción conservan gates de autorización independientes? [Spec §FR-012]

## Notes

- Debe completarlo una persona distinta del implementador.
