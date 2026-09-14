# Especificación: Preparación de enlaces directos de reseña de Google

**Feature Branch**: `codex/google-review-resolution`

**Created**: 2026-09-14

**Status**: Aprobado para implementación

**Input**: Un administrador interno debe poder pegar un enlace compartido de Google Maps durante la configuración rápida de una unidad QR/NFC, convertirlo de forma segura en un enlace directo de reseña, verificar visualmente el negocio y guardar únicamente el destino confirmado.

## User Scenarios & Testing

### User Story 1 - Preparar y confirmar una reseña desde el celular (Priority: P1)

Un administrador interno que configura una unidad física puede pegar el enlace que el negocio comparte desde Google Maps, obtener un enlace que abre la acción de escribir una reseña, comprobar que corresponde al negocio correcto y continuar con “Guardar y activar” sin construir el destino manualmente.

**Why this priority**: Elimina el paso manual más lento y propenso a errores del flujo operativo en campo.

**Independent Test**: Con una unidad disponible y un enlace compartido válido, el administrador prepara el destino, abre la vista de reseña, confirma el negocio y activa la unidad; el destino guardado es el enlace de reseña y la URL permanente QR/NFC no cambia.

**Acceptance Scenarios**:

1. **Given** una unidad cargada en configuración rápida, **When** el administrador pega un enlace compartido válido de una ficha comercial y solicita prepararlo, **Then** recibe un candidato de reseña sin perder la etiqueta ni la asociación elegida.
2. **Given** un candidato preparado, **When** el administrador abre la prueba y confirma que corresponde al negocio, **Then** puede guardar y activar la unidad usando únicamente el destino directo confirmado.
3. **Given** un candidato preparado, **When** el administrador modifica el texto del destino, **Then** la confirmación anterior deja de ser válida y no puede reutilizarse para guardar.
4. **Given** una unidad activa cuyo destino cambia, **When** termina la verificación de Google, **Then** se conserva la confirmación adicional de reemplazo que ya usa el flujo actual.

---

### User Story 2 - Fallar de forma segura y recuperable (Priority: P2)

Un administrador recibe una explicación específica cuando el enlace no es compatible, Google no responde, la ficha no puede identificarse o la resolución intenta salir de los destinos permitidos. Ninguno de esos fallos modifica la unidad ni borra el formulario.

**Why this priority**: La conversión depende de un formato externo no garantizado y debe fallar cerrada para no enviar clientes a una ficha incorrecta.

**Independent Test**: Con enlaces inválidos, ambiguos, externos, con bucles o con fallos simulados de Google, la unidad permanece intacta y el administrador puede corregir el enlace o pegar un enlace directo.

**Acceptance Scenarios**:

1. **Given** una URL inválida o ajena a los formatos admitidos, **When** el administrador intenta prepararla, **Then** ve un mensaje controlado y no se consulta el destino externo.
2. **Given** una cadena que sale de los dominios permitidos, excede cinco saltos o tarda más de ocho segundos, **When** se resuelve, **Then** la operación se detiene sin guardar y ofrece una recuperación manual.
3. **Given** una URL con cero o más de un identificador distinto, **When** se analiza, **Then** no se elige una ficha automáticamente.
4. **Given** un candidato que no corresponde al negocio, **When** el administrador lo rechaza, **Then** puede volver a pegar otra ficha o un enlace directo sin alterar la unidad.

---

### User Story 3 - Conservar compatibilidad y operación existente (Priority: P3)

Los enlaces directos de reseña pueden verificarse sin conversión, los destinos no relacionados con Google siguen su flujo actual y los destinos antiguos ya guardados continúan redirigiendo aunque no cumplan la nueva regla de escritura.

**Why this priority**: Permite introducir la mejora sin migraciones, indisponibilidad ni regresiones sobre inventario existente.

**Independent Test**: Se guardan destinos directos confirmados, se conservan destinos antiguos al editar otros campos y los flujos de WhatsApp, Instagram, carta y sitio web se comportan igual que antes.

**Acceptance Scenarios**:

1. **Given** un enlace directo de reseña admitido, **When** se prepara, **Then** se devuelve como candidato sin necesitar resolver redirecciones y todavía requiere verificación visual.
2. **Given** un destino no Google válido, **When** se guarda desde configuración rápida, **Then** no aparece el subflujo de preparación de reseña.
3. **Given** una unidad con un destino Google antiguo, **When** solo se cambia un campo distinto del destino, **Then** el valor antiguo permanece válido.
4. **Given** un cliente administrativo antiguo que intenta guardar un nuevo enlace compartido como reseña, **When** envía la mutación, **Then** el backend rechaza la escritura e indica que primero debe prepararse.
5. **Given** un enlace corto que Google redirige a `maps.google.com/?q=...&ftid=...`, **When** se prepara, **Then** el host y el identificador se validan antes de construir el candidato sin solicitar otra página.

### Edge Cases

- La URL tiene espacios o caracteres invisibles al copiarla desde un teléfono.
- La URL supera 2.048 caracteres, usa HTTP, credenciales o un puerto personalizado.
- El enlace corto devuelve un `Location` relativo, una respuesta final sin identificador o un código no considerado redirección.
- La cadena de redirecciones contiene un bucle o dos identificadores diferentes.
- La URL final representa una dirección o coordenada en vez de una ficha comercial; la confirmación humana decide y puede rechazarla.
- El navegador bloquea la pestaña de prueba; el destino preparado permanece visible y copiable.
- El administrador cambia de pestaña y regresa: la aplicación no confirma el negocio automáticamente.
- La unidad cambia concurrentemente antes de guardar; se mantiene el manejo de revisión obsoleta existente.
- El formato externo de Google cambia y deja de exponer un identificador utilizable; se ofrece el enlace directo como fallback.
- Google devuelve una ficha mediante la ruta raíz de `maps.google.com` con un `ftid` válido en query,
  en lugar de utilizar `/maps`; este formato observado se admite sin ampliar otros hosts ni rutas raíz.

## Requirements

### Functional Requirements

- **FR-001**: El sistema MUST permitir que un administrador interno prepare un destino de reseña desde un enlace compartido o una URL completa de Google Maps.
- **FR-002**: El sistema MUST reconocer enlaces directos admitidos y someterlos a la misma verificación humana sin convertirlos innecesariamente.
- **FR-003**: El sistema MUST exigir autenticación y rol administrativo global para preparar destinos.
- **FR-004**: El sistema MUST validar la URL inicial y cada redirección antes de consultarla.
- **FR-005**: El sistema MUST consultar únicamente destinos HTTPS de Google expresamente admitidos y MUST rechazar credenciales, direcciones locales, IP y puertos personalizados.
- **FR-006**: El sistema MUST seguir manualmente como máximo cinco redirecciones y detener toda la resolución en máximo ocho segundos.
- **FR-007**: El sistema MUST evitar descargar, almacenar o analizar cuerpos HTML durante la resolución.
- **FR-008**: El sistema MUST extraer únicamente identificadores inequívocos con formato `0x<hex>:0x<hex>` desde la URL.
- **FR-009**: El sistema MUST construir un enlace de acción de reseña exclusivamente a partir de un identificador validado.
- **FR-010**: El sistema MUST detenerse sin candidato cuando no haya identificador o existan identificadores distintos.
- **FR-011**: El administrador MUST abrir explícitamente el candidato antes de poder confirmar que corresponde al negocio.
- **FR-012**: El sistema MUST requerir confirmación explícita del administrador antes de habilitar el guardado de un destino Google preparado.
- **FR-013**: Cualquier cambio en el destino introducido MUST invalidar el candidato y la confirmación anteriores.
- **FR-014**: El sistema MUST guardar únicamente el enlace directo confirmado, nunca el enlace compartido original.
- **FR-015**: Las nuevas escrituras administrativas de destinos de reseña MUST rechazar enlaces cortos o fichas sin acción directa.
- **FR-016**: Los destinos Google antiguos MUST seguir funcionando y MUST poder conservarse cuando una actualización no cambia el destino.
- **FR-017**: Los destinos no Google MUST conservar el flujo de validación y guardado existente.
- **FR-018**: Los fallos MUST conservar todos los campos del formulario y MUST dejar la unidad sin modificaciones.
- **FR-019**: El sistema MUST distinguir con mensajes controlados las URLs inválidas, formatos no admitidos, identificadores ausentes o ambiguos, redirecciones inválidas, fallos del proveedor y tiempos agotados.
- **FR-020**: Los eventos de resolución MUST ser observables sin registrar URLs completas, identificadores, cuerpos, cookies, tokens ni headers sensibles.
- **FR-021**: El sistema MUST conservar la confirmación de reemplazo existente cuando se cambia el destino de una unidad activa.
- **FR-022**: La implementación MUST permitir sustituir el mecanismo de resolución externo sin cambiar la interacción ni el contrato consumido por el dashboard.
- **FR-023**: La implementación MUST reutilizar el destino actual de la unidad y no cambiar su URL permanente de QR/NFC.
- **FR-024**: El sistema MUST ofrecer abrir y copiar manualmente el destino preparado cuando el navegador bloquee la pestaña de prueba.
- **FR-025**: El sistema MUST admitir la ruta raíz de `maps.google.com` únicamente cuando contiene un `ftid` válido e inequívoco; otras rutas raíz o identificadores malformados MUST permanecer rechazados.

### Key Entities

- **Candidato de reseña**: Resultado efímero de preparar una URL; contiene el tipo de origen, el enlace directo propuesto y una referencia visual opcional.
- **Confirmación de reseña**: Estado efímero asociado exactamente al texto preparado y al candidato abierto; autoriza el envío del destino canónico desde la interfaz.
- **Unidad de enlace dinámico**: Entidad existente que conserva su URL permanente y almacena únicamente el destino final confirmado.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Un administrador puede pasar de pegar un enlace compartido válido a tener un candidato verificable en menos de diez segundos cuando Google responde dentro de los límites acordados.
- **SC-002**: El 100 % de los casos automatizados con destinos externos, protocolos inseguros, bucles o demasiados saltos termina sin efectuar una escritura.
- **SC-003**: El 100 % de los nuevos destinos Google guardados mediante los flujos administrativos corresponde a un formato directo admitido.
- **SC-004**: Modificar el texto del destino invalida la confirmación anterior en todos los escenarios automatizados.
- **SC-005**: Los escenarios de WhatsApp, Instagram, carta y sitio web continúan pasando sin activar el flujo de Google.
- **SC-006**: Las pruebas reales en Safari móvil y Chrome móvil permiten preparar, abrir, confirmar y guardar una ficha comercial desde un ancho de 320 px.
- **SC-007**: Ningún log de resolución usado en las pruebas contiene la URL completa, el identificador extraído o el cuerpo de la respuesta externa.
- **SC-008**: La retirada del resolver no exige revertir datos ni cambiar las URLs permanentes de las unidades.

## Assumptions

- La preparación sigue siendo exclusiva de administradores internos; el autoservicio de negocios permanece fuera de alcance.
- La estructura observada del identificador y la acción de reseña de Google no es un contrato público garantizado.
- La confirmación humana es la autoridad para determinar si el candidato muestra la ficha correcta.
- No se añade persistencia, migración, caché, credencial de Google ni rate limiting global en este MVP.
- La operación real contra Google se valida primero en staging y producción requiere autorización explícita separada.
