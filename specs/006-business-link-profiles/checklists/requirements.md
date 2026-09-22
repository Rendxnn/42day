# Checklist de requisitos: perfiles ligeros de negocio

**Propósito**: revisar claridad, cobertura y seguridad de los requisitos antes de implementar.  
**Creado**: 2026-09-22  
**Feature**: [spec.md](../spec.md)

## Cobertura funcional

- [x] CHK001 ¿Los actores, permisos y límites de perfiles genéricos y de restaurantes están definidos? [Spec §US1–US2]
- [x] CHK002 ¿El ciclo borrador, publicación y deshabilitación define estados visibles y no visibles? [Spec §US1, §US3–US4]
- [x] CHK003 ¿Cada tipo de enlace y su regla de visibilidad están especificados? [Spec §US3, FR-003–FR-004]
- [x] CHK004 ¿La compatibilidad de URL, backfill y dual-write tiene requisitos verificables? [Spec §US2, FR-006, FR-008]

## Seguridad y recuperación

- [x] CHK005 ¿La autorización de administrador, encargado y visitante está diferenciada? [Spec §US2, FR-007]
- [x] CHK006 ¿Los conflictos de revisión, enlaces inválidos y perfiles inaccesibles tienen respuestas definidas? [Spec §Casos límite, FR-004–FR-005, FR-010]
- [x] CHK007 ¿La deshabilitación define atomicidad, auditoría y preservación de URL física? [Spec §US4, FR-011]
- [x] CHK008 ¿Se excluyen explícitamente el lote, NFC y producción? [Spec §Fuera de alcance]

## Revisión independiente pendiente

- [ ] CHK009 ¿Un revisor independiente confirma que la publicación inicial y el rol de manager no se contradicen? [Consistencia]
- [ ] CHK010 ¿Un revisor independiente confirma que los criterios de aceptación cubren rollback y datos legacy? [Cobertura]
- [ ] CHK011 ¿Un revisor independiente confirma que la proyección pública no expone enlaces deshabilitados ni datos internos? [Seguridad]

## Notas

Los tres últimos ítems no se autoaprueban por quien implemente la fase.
