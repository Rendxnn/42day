# Roadmap y division de tareas

## Objetivo de esta fase

Dejar claro el funcionamiento completo antes de construir muchas pantallas o flujos complejos.

Prioridad actual:

1. backend WhatsApp,
2. Supabase,
3. logging,
4. flujo conversacional base,
5. contratos para dashboard.

## Division por responsabilidades

### Backend

Responsable de:

- monorepo base,
- Cloudflare Worker,
- webhook WhatsApp,
- envio WhatsApp,
- Supabase schema/migraciones,
- tenant resolver,
- conversaciones,
- mensajes,
- drafts,
- validacion,
- pricing,
- ordenes,
- alertas de handoff,
- contratos API para dashboard.

### Frontend/dashboard

Responsable de:

- app visual,
- login,
- layout,
- vistas de ordenes,
- vistas de alertas,
- formularios de menu,
- CRUD productos/combos/promociones,
- menu del dia,
- experiencia de usuario para roles.

### Compartido

Responsable de ambos:

- revisar contratos de API,
- revisar tipos compartidos,
- validar flujos reales con restaurantes,
- definir textos finales del bot,
- probar end-to-end.

## Milestones

### Milestone 0: base del proyecto

Estado: completado.

Backend:

- estructura monorepo,
- documentacion base,
- `.env.example`,
- decisiones de arquitectura,
- paquetes compartidos,
- Worker inicial,
- migraciones SQL iniciales.

Frontend:

- mover o preparar app dentro de `apps/dashboard`,
- alinear stack con monorepo,
- identificar dependencias y scripts.

### Milestone 1: WhatsApp inbound

Estado: smoke test completado.

Backend:

- crear Hono app,
- crear endpoint `GET /webhooks/whatsapp`,
- crear endpoint `POST /webhooks/whatsapp`,
- validar challenge,
- recibir mensajes,
- guardar raw webhook,
- responder 200 a Meta,
- idempotencia por `provider_message_id`,
- enviar respuesta automatica basica por WhatsApp.

Validado:

- Cloudflare Worker staging desplegado,
- Meta webhook conectado,
- raw webhook guardado en `control.webhook_events`,
- respuesta automatica recibida en WhatsApp.

Pendiente para cerrar este milestone tecnicamente:

- guardar mensaje normalizado en `tenant_demo.messages`,
- diferenciar mensajes inbound de status updates,
- marcar `processed_at`,
- guardar outbound en `tenant_demo.messages`.

Frontend:

- aun no bloqueado.
- puede trabajar mockups de ordenes/alertas.

### Milestone 2: Supabase y tenant demo

Estado: base completada.

Backend:

- crear proyecto Supabase,
- crear schema `control`,
- crear schema `tenant_demo`,
- crear migraciones,
- seed tenant demo,
- resolver tenant por `phone_number_id`,
- registrar mensajes por tenant.

Validado:

- tenant demo activo,
- canal WhatsApp demo registrado,
- bucket `payment-proofs` creado,
- advisors de seguridad sin alertas.

Pendiente:

- reemplazar fallback de tenant por consulta real a `control.tenant_channels`,
- crear menu demo seed para flujo guiado.

Frontend:

- login basico con Supabase Auth o mock temporal,
- estructura de navegacion.

### Milestone 3: WhatsApp outbound

Backend:

- cliente WhatsApp para enviar texto,
- enviar botones/listas si aplica,
- registrar outbound,
- manejar errores de envio.

Frontend:

- vista mock de mensajes recientes si aporta valor.

### Milestone 4: menu del dia y flujo guiado

Backend:

- CRUD API para productos,
- CRUD API para combos/promociones,
- publicar menu del dia,
- flujo guiado,
- draft order persistente,
- pricing basico con domicilio fijo.

Frontend:

- CRUD productos,
- CRUD combos/promociones,
- editor menu del dia,
- vista de ordenes nuevas.

### Milestone 5: pedido libre con parser

Backend:

- prompt versionado,
- llamada LLM,
- JSON schema de salida,
- validacion deterministica,
- clarificaciones,
- logs de parser.

Frontend:

- mostrar alertas de parser/handoff,
- revisar conversaciones problematicas.

### Milestone 6: handoff y transferencias

Backend:

- detectar solicitud de asesor,
- detectar comprobante o pago por transferencia,
- crear alerta humana,
- detener auto-respuestas,
- endpoints para resolver alerta.

Frontend:

- bandeja de alertas,
- detalle de alerta,
- marcar atendida/resuelta,
- reactivar automatizacion si aplica.

### Milestone 7: hardening operativo

Backend:

- timeouts 30 minutos,
- retries/idempotencia robusta,
- logs estructurados,
- errores monitoreables,
- pruebas de funciones core.

Frontend:

- estados vacios,
- errores,
- permisos por rol,
- notificaciones.

## Contratos API iniciales para dashboard

Pendientes de concretar en OpenAPI o docs tecnicas.

Sugeridos:

```txt
GET    /dashboard/orders
GET    /dashboard/orders/:id
PATCH  /dashboard/orders/:id/status

GET    /dashboard/alerts
GET    /dashboard/alerts/:id
PATCH  /dashboard/alerts/:id/acknowledge
PATCH  /dashboard/alerts/:id/resolve

GET    /dashboard/products
POST   /dashboard/products
PATCH  /dashboard/products/:id
DELETE /dashboard/products/:id

GET    /dashboard/combos
POST   /dashboard/combos
PATCH  /dashboard/combos/:id
DELETE /dashboard/combos/:id

GET    /dashboard/promotions
POST   /dashboard/promotions
PATCH  /dashboard/promotions/:id
DELETE /dashboard/promotions/:id

GET    /dashboard/menus/today
POST   /dashboard/menus
PATCH  /dashboard/menus/:id
POST   /dashboard/menus/:id/publish
```

## Cosas que faltan por definir

### Menu y productos

- categorias exactas,
- si el menu del dia tiene disponibilidad por cantidad,
- si un producto puede estar en varios menus,
- cerrado: combos tienen entidad propia y se relacionan con productos existentes mediante `combo_items`,
- reglas de promociones V1.

### Operacion del restaurante

- horarios de atencion,
- una sola sede en MVP; varias sedes quedan para una fase posterior,
- domicilio y pickup desde V1,
- zonas de cobertura,
- formato de direccion requerido.

### Transferencias

- datos bancarios por tenant,
- si la orden se crea antes o despues de validar comprobante,
- quien puede marcar pago como valido,
- texto exacto que se envia al cliente.

### Handoff

- si trabajador puede reactivar automatizacion o solo encargado,
- tiempos esperados de atencion humana,
- si las alertas generan notificaciones push/email/sonido en dashboard.

### WhatsApp

- si usaremos plantillas en algun caso,
- si el bot enviara mensajes fuera de la ventana de 24 horas,
- estrategia de onboarding cuando ya no sea numero demo.

### Seguridad

- permisos exactos por rol,
- si dashboard consume API o Supabase directo,
- politicas RLS definitivas.

### Observabilidad

- que metricas se revisan todos los dias,
- que errores deben alertar al equipo,
- retencion de logs.

## Recomendaciones

- Construir primero el flujo guiado completo; reduce dependencia del LLM.
- No permitir que el dashboard calcule totales finales.
- Mantener prompts versionados desde el primer dia.
- Registrar inbound y outbound siempre.
- Implementar idempotencia antes de crear ordenes reales.
- Usar un tenant demo con datos seed para pruebas end-to-end.
- Definir contratos API antes de que frontend consuma datos reales.
- Evitar automatizar validacion de transferencia en MVP.
