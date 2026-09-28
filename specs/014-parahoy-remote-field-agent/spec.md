# Especificación: agente remoto de campo para prospectos ParaHoy

**Feature**: `014-parahoy-remote-field-agent`
**Creado**: 2026-09-23
**Estado**: listo para revisión e implementación

## Contexto

ParaHoy ya expone un MCP privado capaz de leer perfiles y preparar/confirmar la creación de un perfil con
asignación a un QR. Sin embargo, el consentimiento OAuth no está terminado, el contrato no conoce la nueva
apariencia ni imágenes, no puede actualizar perfiles existentes y no existe un plugin que enseñe al agente a
investigar, presentar evidencia y pedir la confirmación correcta.

El objetivo operativo es que el administrador, estando frente a un prospecto, abra desde su iPhone una tarea
dedicada en Codex Remote, dicte o escriba el negocio y el código QR, y reciba una propuesta verificable. Tras
una confirmación inmediata, el agente crea o actualiza el perfil, lo publica y lo asigna al QR mediante las
herramientas controladas de ParaHoy.

Este feature cambia explícitamente la decisión de transporte de `009-profile-management-agent-actions`:
la primera experiencia certificada sí usa Codex Remote sobre el Mac del administrador. No expone puertos del
Mac ni entrega credenciales al modelo; el MCP continúa siendo HTTPS, OAuth y revocable. El flujo directo desde
ChatGPT móvil sin host local queda como evolución futura.

## Clarificaciones

### Sesión 2026-09-23

- Codex Remote ya es visible para la cuenta del administrador y puede controlar tareas de este Mac.
- Se usará una tarea projectless dedicada a prospectos, no una tarea de desarrollo dentro del repositorio.
- El plugin de staging y el de producción tendrán identidades, URLs OAuth y clientes separados.
- Producción solo se instala/autoriza después de certificar staging y recibir autorización explícita.
- El servidor investiga y muta; el plugin/skill fija el flujo conversacional. ParaHoy no incorpora un scraper.
- La escritura siempre usa `prepare → resumen → confirmación humana → commit`.
- Crear, asignar, actualizar apariencia y reemplazar imagen estarán soportados; retirar, archivar, operar lotes
  o marcar NFC no estarán disponibles.
- Una imagen remota solo se importa después de la confirmación, con validación SSRF y confirmación de derecho
  de uso. Adjuntar una foto al chat puede orientar al agente, pero no la sube automáticamente en v1.
- La descarga permite cualquier URL HTTPS pública y aplica verificación DNS-over-HTTPS antes de cada salto,
  bloqueo de rangos no públicos, redirects manuales y límites estrictos. Cloudflare no permite fijar el socket a
  la IP validada; el riesgo residual de DNS rebinding entre validación y conexión queda documentado y limitado a
  egreso público aislado sin credenciales ni acceso a red privada.
- El modo de conversación móvil certificado es texto o dictado del teclado de iOS. Una conversación de voz
  nativa/full-duplex con Codex Remote no es requisito ni se afirmará como soportada.

## Actores

- **Administrador de sistema en campo**: investiga con el agente, revisa y confirma el cambio.
- **Agente Codex autorizado**: usa fuentes públicas y las herramientas del plugin sin autoridad autónoma.
- **MCP ParaHoy**: autentica, normaliza, prepara y ejecuta el comando permitido.
- **Prospecto/visitante**: ve el perfil publicado, pero no participa en autorización.

## Escenarios y pruebas

### US1 — Abrir una sesión segura desde el teléfono (P1)

Como administrador en la calle, quiero abrir una tarea dedicada desde Codex Remote y verificar ambiente/cuenta
antes de compartir un negocio para no operar por error sobre otro sistema.

**Prueba independiente:** conectar el plugin de staging, abrir la tarea desde iPhone, consultar la cuenta y
demostrar que el ambiente, usuario y cliente corresponden a staging.

1. **Dado** el Mac online con Codex disponible, **cuando** se abre su tarea desde Remote, **entonces** conserva
   el plugin, el contexto y las aprobaciones del host sin exponer el Mac a internet.
2. **Dado** el plugin, **cuando** inicia un trabajo, **entonces** consulta primero cuenta y ambiente.
3. **Dado** un usuario no admin, token inválido o cliente no allowlisted, **cuando** invoca una herramienta,
   **entonces** el servidor rechaza sin revelar perfiles ni QRs.
4. **Dado** el plugin de staging, **cuando** la herramienta reporta otro ambiente, **entonces** el skill se
   detiene antes de investigar o preparar.

### US2 — Investigar y preparar un prospecto (P1)

Como administrador, quiero decir el nombre, ubicación, cuenta social o sitio del negocio y el código QR para
que el agente encuentre datos públicos y prepare un perfil atractivo sin escribir todavía.

**Prueba independiente:** proporcionar un negocio y un QR disponible; verificar propuesta con fuentes,
identidad, links, imagen, apariencia, coincidencias, advertencias y cambio actual → propuesto sin mutaciones
públicas.

1. **Dado** un identificador suficiente, **cuando** investiga, **entonces** prioriza sitio/cuentas oficiales y
   distingue datos confirmados de inferencias.
2. **Dado** información ambigua o contradictoria, **cuando** no puede resolverla, **entonces** pregunta o deja
   el campo vacío; nunca inventa.
3. **Dado** un candidato de Google Reviews, **cuando** prepara, **entonces** usa el resolver existente y exige
   confirmación visual.
4. **Dado** una imagen candidata, **cuando** prepara, **entonces** valida la URL pero no descarga ni persiste
   bytes.
5. **Dado** un QR o perfil cambiado concurrentemente, **cuando** se confirma después, **entonces** la revisión
   esperada impide sobrescribir.

### US3 — Crear, publicar y asignar con confirmación (P1)

Como administrador, quiero confirmar una propuesta visible para crear/publicar el perfil y asignarlo al QR de
forma atómica.

**Prueba independiente:** confirmar una propuesta de staging con avatar remoto y demostrar perfil publicado,
apariencia, asset, QR, auditoría e idempotencia.

1. **Dado** el resumen completo, **cuando** el usuario responde afirmativamente, **entonces** el agente llama
   al commit sin modificar ningún campo de la propuesta.
2. **Dado** un QR activo, **cuando** no existe consentimiento específico, **entonces** el commit falla sin
   cambios.
3. **Dado** una imagen propuesta, **cuando** no se confirma derecho de uso o cambia la URL, **entonces** no se
   importa.
4. **Dado** un fallo en perfil, asset o QR, **cuando** termina el commit, **entonces** no queda un cambio público
   parcial; un asset staged recuperable puede quedar para limpieza.
5. **Dado** el mismo `operationId` y comando, **cuando** se reintenta, **entonces** devuelve el resultado previo
   sin duplicar perfil, asset activo, auditoría ni asignación.

### US4 — Actualizar un perfil existente (P1)

Como administrador, quiero corregir identidad, enlaces, apariencia o imagen de un perfil ya creado mediante el
mismo flujo seguro.

**Prueba independiente:** obtener un perfil publicado, preparar un cambio parcial, revisar el diff y confirmar
con revisión fresca.

1. **Dado** un cambio parcial, **cuando** prepara, **entonces** la propuesta normalizada incluye el estado final
   completo y el diff campo por campo.
2. **Dado** un perfil publicado, **cuando** prepara, **entonces** muestra cuántos QRs activos consumen el perfil
   y exige consentimiento de impacto público.
3. **Dado** links no mencionados, **cuando** prepara un patch, **entonces** se preservan; una lista de links
   aportada es reemplazo completo y se declara como tal.
4. **Dado** un avatar, **cuando** la acción es `keep`, `remove` o `import`, **entonces** solo ocurre esa acción.
5. **Dado** revisión stale, **cuando** confirma, **entonces** falla y exige obtener/preparar otra vez.

### US5 — Conectar, revocar y separar ambientes (P1)

Como operador, quiero que el plugin use OAuth verificable y revocable, con staging y producción claramente
separados, para limitar una conexión comprometida o una selección equivocada.

**Prueba independiente:** autorizar staging por OAuth/PKCE, completar el flujo, revocar el grant y demostrar
rechazo; luego comprobar que el cliente no es aceptado por producción.

1. **Dado** un MCP sin token, **cuando** el cliente conecta, **entonces** descubre el recurso protegido y el
   authorization server oficial de Supabase.
2. **Dado** una solicitud OAuth, **cuando** aparece consentimiento, **entonces** muestra nombre del cliente,
   ambiente, scopes y capacidades ParaHoy antes de aprobar o negar.
3. **Dado** un cliente registrado dinámicamente para bootstrap, **cuando** queda identificado y allowlisted,
   **entonces** se desactiva el registro dinámico abierto.
4. **Dado** un grant revocado, **cuando** se reutiliza o refresca, **entonces** deja de autorizar herramientas.
5. **Dado** un cliente/URL de staging, **cuando** llega a producción, **entonces** la allowlist lo rechaza.

## Casos límite

- El Mac duerme, pierde red, cierra Codex o deja de aparecer como host remoto.
- Remote conserva una tarea pero el plugin fue actualizado y requiere iniciar una nueva.
- El dictado introduce un código QR incorrecto, caracteres o espacios; el agente lo repite antes de preparar.
- Dos negocios comparten nombre o redes parecidas; se muestran fuentes y coincidencias.
- Una fuente pública bloquea navegación, requiere login o no permite confirmar propiedad.
- La URL de imagen redirige, cambia DNS, apunta a IP privada, excede 3 MiB, miente sobre MIME o es SVG.
- La descarga/importación termina y el perfil/QR cambia antes de la transacción final.
- Dos commits concurrentes usan el mismo `operationId` mientras un asset está importándose.
- El authorization server rota llaves, vence el access token o revoca el refresh token durante la sesión.
- El plugin equivocado reporta `production` mientras la tarea se tituló staging, o viceversa.

## Requisitos funcionales

### Sesión y plugin

- **FR-001**: Debe existir un plugin privado ParaHoy para Codex que agrupe MCP y un skill de prospectos.
- **FR-002**: Staging y producción DEBEN tener plugins, nombres visibles, URLs MCP y clientes OAuth distintos.
- **FR-003**: La primera versión DEBE operar en una tarea Codex Remote projectless dedicada y ejecutada en el
  Mac autorizado.
- **FR-004**: El skill DEBE consultar `parahoy_get_connected_account` al inicio y detenerse si cuenta, rol o
  ambiente no coinciden con el plugin.
- **FR-005**: El flujo móvil certificado DEBE funcionar con texto y dictado del teclado de iOS; no dependerá de
  una API de voz nativa.
- **FR-006**: El skill DEBE repetir el código QR normalizado y el ambiente antes de preparar una escritura.

### Investigación y propuesta

- **FR-007**: La investigación pública DEBE ocurrir en el agente, no en un scraper del backend ParaHoy.
- **FR-008**: El agente DEBE priorizar fuentes propias/oficiales del negocio y adjuntar evidencia a los campos
  propuestos.
- **FR-009**: El agente NO DEBE inventar información ni superar bloqueos/login; ambigüedades se preguntan o se
  omiten.
- **FR-010**: El agente DEBE consultar coincidencias existentes antes de proponer crear un perfil duplicado.
- **FR-011**: La propuesta DEBE incluir identidad, links activados, imagen, cuatro colores, modo de iconos,
  QR, revisiones, fuentes, advertencias y diff actual → propuesto.
- **FR-012**: Google Reviews DEBE usar el resolver y la confirmación visual existentes.
- **FR-013**: Preparar NO DEBE publicar, asignar QR, cambiar perfil ni descargar/persistir la imagen candidata.
- **FR-014**: Toda preparación DEBE expirar en diez minutos y vincular actor, cliente, ambiente, targets,
  revisiones y hash del comando propuesto.

### Herramientas y mutaciones

- **FR-015**: `parahoy_prepare_business_setup` DEBE aceptar apariencia, avatar remoto opcional y evidencia.
- **FR-016**: `parahoy_commit_business_setup` DEBE exigir token, `operationId`, confirmación, decisión de
  duplicado, consentimiento de QR activo y derecho de imagen cuando correspondan.
- **FR-017**: Deben existir `parahoy_prepare_business_profile_update` y
  `parahoy_commit_business_profile_update` con patch explícito y revisión optimista.
- **FR-018**: Una actualización publicada DEBE mostrar conteo de QRs activos y exigir consentimiento de impacto.
- **FR-019**: Los campos omitidos en un patch DEBEN preservarse; `links` presente representa reemplazo completo.
- **FR-020**: La acción de avatar DEBE distinguir `keep`, `remove` e `import`.
- **FR-021**: Un commit DEBE aplicar perfil/publicación/asignación de QR en una transacción de datos; fallos
  revierten la mutación pública completa.
- **FR-022**: Reintentar el mismo `operationId` y comando DEBE devolver el resultado previo; otro comando DEBE
  fallar.
- **FR-023**: Un QR activo NO DEBE cambiar sin consentimiento individual y su URL permanente nunca cambia.
- **FR-024**: El MCP NO DEBE exponer herramientas para deshabilitar, borrar, archivar, bloquear NFC, operar
  lotes o ejecutar SQL.

### Importación de imagen

- **FR-025**: La URL candidata DEBE ser HTTPS pública, sin usuario/contraseña y máximo 2048 caracteres.
- **FR-026**: El commit DEBE verificar que el hash de la URL completa coincide con el preparado antes de
  descargarla; la URL completa no se persiste ni se registra.
- **FR-027**: Antes de cada salto, la descarga DEBE resolver A/AAAA por el resolver DNS-over-HTTPS permitido,
  rechazar IPs literales y loopback, link-local, privada, reservada; seguir manualmente un máximo de tres
  redirects HTTPS y validar el destino efectivo final. La especificación DEBE declarar que Cloudflare no permite
  fijar el socket del fetch a la IP validada y documentar el riesgo residual de DNS rebinding.
- **FR-028**: La descarga DEBE limitarse a 3 MiB y aceptar solo JPEG, PNG o WebP por firma/decodificación; SVG y
  MIME falso se rechazan.
- **FR-029**: La importación DEBE requerir confirmación explícita de derecho de uso y alt text controlado.
- **FR-030**: El asset importado DEBE usar el ciclo staged/active de feature 013 y no ser público antes del
  commit.
- **FR-031**: Concurrencia o reintento durante importación DEBE usar una lease corta y nunca activar dos assets
  para una misma operación.

### OAuth y autorización

- **FR-032**: El MCP DEBE publicar Protected Resource Metadata y remitir al issuer `/auth/v1` de Supabase.
- **FR-033**: La discovery del authorization server DEBE provenir de los endpoints oficiales de Supabase; la
  API ParaHoy NO DEBE sintetizar endpoints OAuth propios.
- **FR-034**: El consentimiento DEBE usar `getAuthorizationDetails`, `approveAuthorization` y
  `denyAuthorization`, conservar `authorization_id` durante login y mostrar cliente/scopes/ambiente.
- **FR-035**: Toda invocación DEBE validar firma JWT asimétrica, issuer, audience, expiración, sujeto,
  `client_id` allowlisted y rol `system_admin` actual.
- **FR-036**: DCR solo PUEDE habilitarse temporalmente para registrar el cliente controlado; después se fija el
  `client_id`, se allowlistea y DCR vuelve a deshabilitarse.
- **FR-037**: La autorización DEBE ser revocable sin cambiar contraseña ni desplegar código.
- **FR-038**: El plugin NO DEBE contener service role, contraseña, bearer token, refresh token ni secreto OAuth.

### Operación y mensajes

- **FR-039**: Errores de tool DEBEN devolver código y mensaje español controlado, sin stack ni detalles internos.
- **FR-040**: El servidor DEBE limitar por actor+cliente a 120 prepares y 30 commits por hora por defecto.
- **FR-041**: La auditoría DEBE registrar actor, cliente, ambiente, tool, operación, targets, revisiones, resultado
  y hash de fuente de imagen, sin tokens, payload completo ni query strings.
- **FR-042**: La tarea de campo DEBE contar con un fallback documentado al dashboard si Remote, OAuth, MCP o la
  investigación no están disponibles.
- **FR-043**: Cambiar de staging a producción DEBE requerir nueva conexión OAuth y verificación verbal/escrita
  del ambiente antes de preparar.
- **FR-044**: Ninguna configuración, despliegue o migración de producción forma parte de la implementación local.
- **FR-045**: El límite de commits DEBE contar una sola vez cada `operationId` lógico al primer intento
  autenticado; reintentos idempotentes de esa operación no consumen cupo adicional.

## Requisitos no funcionales

- **NFR-001 Seguridad**: toda autoridad permanece en backend; instrucciones del skill y confirmación textual no
  sustituyen autenticación/autorización.
- **NFR-002 Privacidad**: no se loguean tokens, email innecesario, URL completa de imagen, query strings,
  cuerpos completos de perfil ni contenido descargado.
- **NFR-003 Resiliencia**: una pérdida de conexión después del commit se recupera mediante replay idempotente.
- **NFR-004 Latencia**: prepare sin investigación externa responde p95 <800 ms y commit sin imagen p95 <1.5 s
  en staging; la importación reporta progreso y timeout controlado de 15 s.
- **NFR-005 Compatibilidad**: herramientas existentes conservan nombre; clientes viejos que omiten apariencia
  reciben defaults. La tabla/RPC legacy se conserva para rollback.
- **NFR-006 Portabilidad**: el plugin no depende del checkout del repositorio ni de secretos locales distintos
  de su grant OAuth administrado por Codex.

## Entidades clave

- **Plugin de ambiente**: paquete privado con identidad, MCP y skill de flujo.
- **Preparación de agente**: snapshot opaco de propuesta, targets y revisiones por diez minutos.
- **Operación de agente**: comando idempotente de setup o actualización.
- **Lease de importación**: exclusión breve para descargar/crear un único asset staged por operación.
- **Evidencia pública**: URL sanitizada y descripción de los campos que respalda.

## Criterios de éxito

- **SC-001**: Desde iPhone, el administrador dicta/escribe negocio y QR y completa propuesta, confirmación y
  publicación en staging en menos de cinco minutos, excluyendo una investigación manual bloqueada.
- **SC-002**: El 100% de commits ejecutados tiene una preparación vigente y confirmación explícita inmediatamente
  anterior.
- **SC-003**: El 100% de tokens/clientes/roles inválidos y cruces de ambiente se rechaza antes de leer datos.
- **SC-004**: 20 recorridos consecutivos en staging, incluidos cinco con imagen y cinco actualizaciones, no
  producen duplicados ni cambios parciales.
- **SC-005**: Revocar el grant hace fallar la siguiente invocación protegida y el dashboard sigue operativo.
- **SC-006**: Ningún secreto privilegiado queda en el plugin, transcript, repositorio o respuesta de tools.

## Supuestos

- El Mac permanece encendido, conectado y disponible como host Remote durante la visita.
- El administrador usa la misma cuenta ChatGPT autorizada y protege el iPhone con Face ID/código.
- Feature 013 está implementada antes de activar campos de apariencia/avatar.
- El operador confirma que cuenta con permiso para usar la imagen pública elegida.
- La URL permanente escrita en el hablador ya existe o se copiará mediante feature 012.

## Fuera de alcance

- ChatGPT Voice o una llamada de voz full-duplex con Codex Remote.
- Un backend que rastree automáticamente la web o redes sociales.
- Importar directamente una foto adjunta/cámara del chat al perfil.
- Entregar credenciales ParaHoy en el prompt o usar service role/Supabase MCP desde la tarea de campo.
- Gestión masiva, deshabilitación, hard delete, NFC programado/verificado/bloqueado o cambios de tenant.
- Publicación del plugin en un directorio público.
- Instalación/conexión/despliegue/migración de producción sin autorización posterior explícita.
