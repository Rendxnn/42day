# Checklist de calidad de requisitos: handoff NFC.cool en iPhone

**Propósito**: Validar que los requisitos del cambio de proveedor NFC sean completos y revisables antes de implementación.  
**Creada**: 2026-09-23  
**Feature**: [spec.md](../spec.md)

## Calidad de contenido

- [x] No quedan marcadores de aclaración ni decisiones de producto abiertas. [Spec completa]
- [x] El valor para el operador y la exclusión de automatizar la escritura física están definidos. [Spec §Contexto, §Fuera de alcance]
- [x] Los requisitos distinguen proveedor activo, adaptador legado y fallback manual. [Spec §FR-001, §FR-005, §FR-006]

## Completitud y claridad

- [x] Se especifica qué URL puede entregarse al proveedor y cómo se transmite. [Spec §FR-002, §FR-004]
- [x] Se especifica el tratamiento de unidades archivadas y de aplicaciones/Atajos ausentes. [Spec §FR-003, §Casos límite]
- [x] Se especifica que ninguna señal externa cambia hitos NFC o UID. [Spec §FR-007, §FR-008]
- [x] Se especifica la preparación única requerida en el iPhone. [Spec §US3, §FR-006]
- [x] Se especifica una métrica física externa y su condición de certificación. [Spec §SC-003]

## Consistencia y riesgos

- [x] Los requisitos conservan la URL permanente y no delegan autoridad física a una app externa. [Spec §FR-002, §FR-007]
- [x] La deshabilitación de NFC Helper no implica borrar el adaptador legado. [Spec §FR-005]
- [x] El alcance no exige migración ni despliegue de producción. [Spec §Assumptions, §Fuera de alcance]

## Notas

- La revisión independiente del checklist y la matriz física siguen siendo gates externos; su evidencia no se autoaprueba durante la implementación.
