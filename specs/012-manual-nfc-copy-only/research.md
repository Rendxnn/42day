# Investigación: copia manual como único flujo NFC

## Decisión: retirar el proveedor en vez de sustituirlo

**Decisión:** no buscar ni integrar otra aplicación dentro de esta feature. NFC.cool depende de una
capacidad paga y NFC Helper presentó truncamiento; la única capacidad confiable de ParaHoy es entregar la
URL permanente.

**Razón:** un nuevo proveedor volvería a exigir investigación comercial, contrato de invocación y prueba
física. Mezclarlo impediría cerrar el riesgo actual.

**Alternativas descartadas:** mantener NFC.cool oculto tras flag; elegir otra app sin contrato público;
escritura Web NFC en iPhone.

## Decisión: `410 Gone` para el endpoint anterior

**Decisión:** conservar la ruta autenticada y responder `410 nfc_handoff_disabled`.

**Razón:** un 404 no diferencia retiro intencional de error de routing; devolver el handoff anterior
mantendría una capacidad que producto retiró.

**Alternativas descartadas:** borrar la ruta inmediatamente; devolver `200` con una URL de copia; redirigir a
una aplicación externa.

## Decisión: copiar desde el estado fresco de la unidad

**Decisión:** copiar `unit.publicUrl` recibido por la carga vigente de la unidad.

**Razón:** la URL ya es canónica y no necesita reconstrucción cliente. Copiar el destino final rompería la
indirección que permite cambiar perfiles sin reescribir el chip.

## Decisión: preservar NFC Helper como legado no seleccionable

**Decisión:** no borrar su constructor ni la ruta de consumo dentro de este feature; no permitir nuevos
lanzamientos o sesiones.

**Razón:** el usuario pidió conservar la implementación y la compatibilidad histórica ya está aislada.

**Condición de retiro:** feature explícito posterior que pruebe ausencia de sesiones válidas, elimine tipos,
RPC, ruta y datos sin afectar auditoría.
