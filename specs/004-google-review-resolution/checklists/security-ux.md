# Checklist de requisitos: seguridad y UX móvil

**Purpose**: Revisar que el plan aprobado cubra fronteras de red, recuperación y confirmación móvil
**Created**: 2026-09-14
**Feature**: [spec.md](../spec.md)

## Requirement Completeness

- [x] CHK001 ¿Están definidos los formatos Google admitidos y el tratamiento de enlaces directos? [Completeness, Spec §FR-001-FR-002]
- [x] CHK002 ¿Están definidos los fallos externos y su recuperación sin mutación? [Completeness, Spec §FR-018-FR-019]
- [x] CHK003 ¿Está definida la compatibilidad para destinos legacy y no Google? [Completeness, Spec §FR-016-FR-017]

## Requirement Clarity

- [x] CHK004 ¿Son inequívocos los límites de tamaño, saltos y tiempo? [Clarity, Spec §FR-006]
- [x] CHK005 ¿Se distingue referencia visual de identidad autoritativa? [Clarity, Spec §Key Entities]
- [x] CHK006 ¿Está claro qué invalida una confirmación previa? [Clarity, Spec §FR-013]

## Requirement Consistency

- [x] CHK007 ¿La obligación de confirmar es consistente para links compartidos, completos y directos? [Consistency, Spec §FR-002, FR-011-FR-012]
- [x] CHK008 ¿La regla de no guardar el origen coincide con la compatibilidad legacy? [Consistency, Spec §FR-014-FR-016]

## Scenario Coverage

- [x] CHK009 ¿Están cubiertos flujo principal, rechazo, popup bloqueado, edición, timeout y concurrencia? [Coverage, Spec §Edge Cases]
- [x] CHK010 ¿La recuperación móvil conserva los demás campos? [Coverage, Spec §FR-018, FR-024]

## Non-Functional Requirements

- [x] CHK011 ¿La especificación limita SSRF en URL inicial y cada salto? [Security, Spec §FR-004-FR-005]
- [x] CHK012 ¿La privacidad de logs excluye URL, identificador, body y credenciales? [Privacy, Spec §FR-020]
- [x] CHK013 ¿El objetivo de tiempo es medible y consistente con los timeouts? [Measurability, Spec §SC-001]

## Dependencies & Assumptions

- [x] CHK014 ¿Está documentado que el formato de Google no es garantizado y existe fallback? [Assumption, Spec §Assumptions]
- [x] CHK015 ¿Está delimitado que staging y producción requieren autorizaciones posteriores? [Boundary, Spec §Assumptions]

## Notes

- Los ítems están satisfechos por decisiones explícitas del plan aprobado; no representan aprobación de la implementación.
