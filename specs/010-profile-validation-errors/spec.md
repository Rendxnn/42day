# Especificación: Validación comprensible de perfiles de negocio

**Feature**: `010-profile-validation-errors`  
**Estado**: Implementado localmente; pendiente de revisión y despliegue autorizado en staging  
**Fecha**: 2026-09-22

## Propósito

Evitar que la configuración de un perfil de negocio termine mostrando códigos internos como
`business_profile_phone_invalid`. Los campos deben aceptar formatos habituales, rechazar datos
ambiguos o inseguros con límites consistentes y explicar al administrador cómo corregirlos.

## Problema observado

El API valida varios campos, pero la interfaz muestra el código técnico que recibe en `error`. La
normalización de teléfono también trata cualquier carácter no numérico como si fuera separador, lo que
produce rechazos difíciles de entender o acepta entradas con texto accidental. La configuración rápida
y el modal de perfiles no comparten una guía visible de límites.

## Evidencia actual

- `apps/api/src/features/public-profile/business-profile-validation.ts` concentra las reglas del
  endpoint, pero su error técnico llegaba sin copy apto para el dashboard.
- `apps/dashboard/src/features/admin/QuickDynamicLinkSetup.tsx` y el modal de perfiles eran las
  superficies donde el administrador podía ver el código de validación.
- `apps/api/test/business-profiles.test.mjs` y `apps/dashboard/test/business-profiles.test.mjs` son
  la regresión automatizada; el corte previo no cubría formatos telefónicos con prefijos y separadores.

## Alcance y dependencias

### Incluido

- Validación compartida de perfiles, teléfonos y enlaces activables.
- Contrato de error seguro para API, configuración rápida, modal y agente.
- Ayudas visibles, límites, accesibilidad y fallbacks de red/JSON en el dashboard.

### Excluido

- Cambios de esquema, migraciones, despliegues o verificación de existencia del número.

### Dependencias

- Contratos de `@42day/types`, reglas puras de `@42day/core`, flujo de reseñas de Google existente y
  autorización administrativa vigente.

## Actores

- **Administrador del sistema**: crea o edita perfiles y configura QRs.
- **Agente autorizado**: prepara perfiles mediante el contrato existente, sin recibir mensajes internos.
- **Visitante**: no envía datos al administrador y queda fuera del alcance.

## Escenarios de usuario y aceptación

### US1 — Corregir un campo con instrucciones claras (P1)

Como administrador, quiero saber qué corregir cuando un campo es inválido para no adivinar el formato.

1. Un teléfono acepta espacios, paréntesis, guiones, prefijos `+`, `tel:` y URLs comunes de WhatsApp,
   siempre que el resultado tenga entre 7 y 15 dígitos.
2. Un teléfono con letras, una extensión no soportada, menos de 7 o más de 15 dígitos muestra una
   instrucción concreta y un ejemplo, sin mostrar el código técnico.
3. Cada campo de texto y enlace muestra su límite o formato esperado antes de guardar.
4. Un enlace desactivado no se valida ni bloquea el guardado por tener un valor vacío; un enlace
   activado sí debe cumplir las reglas de su tipo.

### US2 — Recibir errores controlados desde cualquier superficie (P1)

Como administrador, quiero que los errores de validación del modal, configuración rápida y agente se
traduzcan a mensajes seguros y consistentes.

1. Las respuestas de validación incluyen un código estable y un mensaje apto para mostrar, además del
   campo cuando pueda identificarse.
2. La UI traduce códigos conocidos a español y usa un mensaje genérico seguro para códigos desconocidos,
   errores de red, HTML inesperado y excepciones no clasificadas.
3. Ninguna pantalla de perfiles muestra identificadores como `business_profile_*`, trazas, SQL o
   mensajes de proveedores.
4. El agente conserva códigos estructurados para automatización, pero el texto visible de la herramienta
   describe el problema sin filtrar detalles internos.

### US3 — Mantener compatibilidad y seguridad (P1)

1. Los enlaces web solo aceptan HTTPS público sin credenciales ni hosts locales.
2. Instagram, TikTok y Facebook solo aceptan sus hosts oficiales; Google Reviews exige preparación y
   confirmación existentes.
3. Los límites se aplican igual al endpoint administrativo, configuración rápida y herramienta del agente.
4. Datos válidos ya guardados continúan pudiéndose editar sin migración destructiva.

## Requisitos funcionales

- **FR-001**: El backend DEBE normalizar teléfonos y WhatsApp con separadores habituales, prefijo opcional
  y formatos `tel:`/WhatsApp documentados; DEBE rechazar letras, extensiones y longitudes fuera de 7–15
  dígitos.
- **FR-002**: El backend DEBE declarar límites canónicos para nombre, titular, sede, dirección, slug,
  etiqueta, URL y número de enlaces, y todas las superficies DEBEN reutilizarlos.
- **FR-003**: El backend DEBE omitir la validación de `href` de un enlace desactivado cuando el enlace está
  presente solo como plantilla vacía; los enlaces activados DEBEN validarse completamente.
- **FR-004**: Las rutas de perfiles y configuración rápida DEBEN responder errores de validación con
  `{ error, message, field? }` sin stack ni detalles de base de datos.
- **FR-005**: El contrato del agente DEBE conservar `error` estable y devolver `message` seguro y accionable.
- **FR-006**: El dashboard DEBE traducir códigos conocidos y tener fallback para cualquier error no
  conocido o no JSON.
- **FR-007**: Los formularios DEBEN mostrar límites, placeholders realistas, `maxLength` e indicaciones
  accesibles para nombre, titular, sede, dirección y cada tipo de enlace.
- **FR-008**: Las reglas existentes de HTTPS, hosts oficiales y preparación de Google Reviews NO DEBEN
  relajarse.

## Requisitos no funcionales

- **NFR-001 Seguridad**: Los mensajes no deben incluir secretos, tokens, SQL, URLs firmadas ni cuerpos
  completos de proveedores.
- **NFR-002 Compatibilidad**: No cambia la URL permanente de los QRs, el modelo de publicación ni las
  rutas públicas existentes.
- **NFR-003 Accesibilidad**: Los errores se anuncian con `aria-live`, se asocian al formulario y no
  dependen solo del color.

## Fuera de alcance

- Validación de existencia o propiedad de un número telefónico.
- Conversión automática de números nacionales a un país que no haya sido seleccionado.
- Cambios en la resolución de Google Reviews o en la política de URLs públicas.
- Migraciones de datos o borrado de enlaces existentes.

## Supuestos

- Se conserva la ventana E.164 de 7–15 dígitos y se acepta el formato nacional si no contiene letras;
  el sistema no inventa un código de país.
- Los límites actuales de URL (2048) y enlaces (30) son compatibles con datos existentes y permanecen,
  mientras que los textos reciben límites más explícitos y visibles.
- El código técnico continúa disponible en la respuesta para observabilidad, pero nunca se muestra como
  único mensaje al usuario.

## Criterios de éxito

- **SC-001**: Ninguna prueba de UI de perfiles muestra una cadena `business_profile_` al usuario.
- **SC-002**: Al menos 12 formatos de teléfono válidos y 8 inválidos están cubiertos por pruebas de
  comportamiento del backend.
- **SC-003**: Modal, configuración rápida y agente producen mensajes controlados para cada código de
  validación conocido y para un código desconocido.
- **SC-004**: Los formularios muestran límites y formatos antes de la primera petición de guardado.
- **SC-005**: Las reglas de enlaces inseguros y Google Reviews siguen rechazando los casos existentes.
