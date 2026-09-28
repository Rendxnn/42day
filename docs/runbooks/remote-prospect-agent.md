# Agente remoto de campo ParaHoy

## Estado de implementación

Los directorios `plugins/parahoy-prospectos-staging/` y `plugins/parahoy-prospectos-production/` son paquetes locales, aislados por URL/identificador y sin credenciales. No están instalados ni conectados. El MCP local expone la creación/asignación legacy; no ofrece aún actualización de perfil ni importación segura de imagen remota. La pantalla `/oauth/consent` y `auth.oauth_server.enabled=true` aplican al entorno local solamente. Esta guía no afirma que los Workers o Supabase remotos hayan recibido esos cambios.

## Objetivo operativo

La sesión de Codex desde el celular debe continuar la tarea que corre en el Mac/host local, donde existe el plugin MCP autorizado. La conversación móvil no recibe service role, token manual ni acceso directo a SQL. Si el Mac está dormido, sin red o Codex no está conectado, el agente debe detenerse; no existe una sesión persistente garantizada mientras el host está apagado.

## Antes de habilitar staging

Completar y revisar `specs/014-parahoy-remote-field-agent/` y `specs/013-brandable-business-profiles/`, incluidos:

1. Migraciones y RPC aplicadas/probadas en Supabase local desde base limpia y snapshot compatible.
2. API/dashboard desplegables en staging y pruebas de regresión de login, tenant, perfil y QR.
3. Metadatos Protected Resource con `resource` idéntico a la URL `/mcp` del Worker y discovery OAuth Supabase confirmado para ese proyecto.
4. Supabase Auth OAuth server habilitado en staging y callback UI staging publicado en `/oauth/consent`.
5. Cliente OAuth **staging** propio, PKCE, callback URI revisada. DCR solo se habilita temporalmente para crear y validar el cliente, luego se apaga.
6. `MCP_ALLOWED_CLIENT_IDS` del Worker staging contiene únicamente el client ID staging; nunca el de producción.
7. Instalar solo el plugin staging en la sesión/tarea que opera staging; aprobar scopes revisados y verificar con `parahoy_get_connected_account` que el entorno diga `staging`.
8. Ejecutar checklist de seguridad/operaciones por otra persona, actualizar el inventario y probar revocación antes de visita real.

La configuración OAuth no se completa con una migración SQL solamente: incluye configuración Auth, dashboard callback, URL del Worker, allowlist y consentimiento. No pegar secretos en `.mcp.json`, tickets, logs o instrucciones del agente.

## Uso durante una visita

1. Abrir desde el celular la tarea remota de Codex que se ejecuta en el Mac y confirmar que el host/tarea sigue conectado.
2. Enviar nombre y ubicación del prospecto, código QR leído, objetivo (crear o actualizar), enlaces o redes conocidas y notas de verificación.
3. Esperar a que el agente compruebe ambiente/cuenta, investigue fuentes públicas y presente coincidencias y advertencias.
4. Revisar la propuesta exacta: perfil, enlaces, destino actual/nuevo, impacto de QRs activos y derechos de la imagen. Confirmar explícitamente solo cuando esté correcta.
5. Después del commit, comprobar el perfil/QR en dashboard. Programar el chip de manera separada con la URL permanente; no registrar escritura, verificación ni bloqueo por un resultado MCP.

## Revocación y fallas

- Para revocar: quitar el client ID de la allowlist del Worker, revocar el grant OAuth del usuario/cliente y eliminar/deshabilitar el cliente no reconocido en Supabase Auth. Estas acciones requieren autorización y coordinación operacional.
- Si el entorno es incorrecto, el host cae, OAuth falla, la preparación vence o la fuente de imagen no valida, no improvisar ni usar otro ambiente; pausar y recurrir al flujo manual del dashboard.
- Producción requiere completar su implementación, configurar su propio cliente/allowlist y recibir autorización explícita separada. Nunca copiar un cliente, token, secreto o autorización de staging.

## Gates

Despliegue staging, migración staging, alta de clientes OAuth y cualquier cambio en producción son gates posteriores y no se ejecutan con esta guía. La lista de aceptación detallada y contratos viven en `specs/014-parahoy-remote-field-agent/`.
