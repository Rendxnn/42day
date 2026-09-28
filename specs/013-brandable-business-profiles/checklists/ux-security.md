# Checklist UX y seguridad: perfiles públicos personalizables

**Purpose**: gate formal de requisitos para revisor independiente
**Created**: 2026-09-23
**Feature**: [spec.md](../spec.md)

## Estructura y accesibilidad

- [ ] CHK001 ¿La estructura fija y la ausencia de layouts alternativos están definidas sin contradicción? [Spec §FR-005]
- [ ] CHK002 ¿Los umbrales de contraste y su efecto por estado están cuantificados? [Spec §FR-010–012]
- [ ] CHK003 ¿Los requisitos cubren 320–1440 px, teclado, foco, lector y movimiento reducido? [Spec §SC-003, Contract visual]
- [ ] CHK004 ¿El fallback de imagen y el estado sin enlaces están especificados? [Spec §FR-004, Contract visual]

## Marca

- [ ] CHK005 ¿Se distingue logo oficial de pictograma genérico y se prohíbe recolor de marca? [Spec §FR-007–009]
- [ ] CHK006 ¿La procedencia y actualización de recursos oficiales tiene un requisito verificable? [Spec §FR-009]
- [ ] CHK007 ¿Los enlaces custom evitan inferencias de marca no autorizadas? [Contract visual]

## Assets y autorización

- [ ] CHK008 ¿Estados, expiración, activación y no borrado de assets están completos? [Spec §FR-019–021]
- [ ] CHK009 ¿Las fronteras de admin y manager están definidas para perfiles propios y ajenos? [Spec §FR-016–018]
- [ ] CHK010 ¿Se prohíben URLs firmadas persistentes, bytes y datos sensibles en logs? [Spec §FR-023–025]
- [ ] CHK014 ¿Dimensiones, megapíxeles, estructura y metadata prohibida se rechazan antes de almacenar? [Spec §FR-019, FR-028]
- [ ] CHK015 ¿El preview común autoriza admin, creador o manager del tenant sin filtrar existencia? [Contract assets]
- [ ] CHK016 ¿El límite persistente de 30 cargas/hora sobrevive reinicios y devuelve 429/Retry-After? [Spec §FR-027]

## Concurrencia y rollout

- [ ] CHK011 ¿Apariencia y asset participan explícitamente en revisión optimista? [Spec §FR-014–015]
- [ ] CHK012 ¿Backfill, compatibilidad `/r` y rollback de código están documentados? [Spec §FR-003, FR-024]
- [ ] CHK013 ¿Staging y producción permanecen como gates independientes? [Spec §FR-026]
- [ ] CHK017 ¿Cinco recorridos cronometrados demuestran el objetivo de menos de tres minutos? [Spec §SC-001, SC-008]

## Notes

- El implementador no autoaprueba este checklist.
