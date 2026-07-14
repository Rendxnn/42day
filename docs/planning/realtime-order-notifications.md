# Notificaciones en tiempo real de pedidos y handoffs

## Que se implemento

Se agrego una campanita global en el dashboard para avisar cuando llegan pedidos nuevos o aparece una alerta humana abierta. La notificacion incluye:

- Contador visual de pedidos nuevos.
- Panel desplegable con las ultimas alertas.
- Sonido corto usando Web Audio API.
- Notificacion del navegador si el usuario concede permiso.
- Conexion WebSocket con Supabase Realtime.
- Refresco de respaldo cada 30 segundos.

## Como funciona

El dashboard escucha cambios sobre la tabla `orders` del schema del tenant activo. Para el tenant demo, por ejemplo, escucha:

```txt
tenant_demo.orders
```

Cuando Supabase Realtime emite un evento `INSERT` o `UPDATE`, el frontend vuelve a consultar la lista de pedidos con:

```txt
GET /dashboard/:tenantSlug/orders?bucket=all
```

Luego filtra pedidos con estados notificables:

```txt
new
pending_restaurant_confirmation
needs_customer_replacement
```

La primera carga solo establece una linea base para no sonar por datos antiguos. Despues de eso, si aparece un pedido notificable o una alerta humana abierta cuyo ID no habia visto la sesion, se agrega al panel, aumenta el contador, muestra toast, reproduce sonido y dispara notificacion del navegador si esta autorizada. Polling y reconexion no repiten el aviso para el mismo ID.

## Realtime usado

Se usa Supabase Realtime con `postgres_changes`:

```ts
supabase
  .channel(`dashboard-orders:${tenantSlug}`)
  .on("postgres_changes", { event: "INSERT", schema: tenantSchema, table: "orders" }, handler)
  .on("postgres_changes", { event: "UPDATE", schema: tenantSchema, table: "orders" }, handler)
  .subscribe();
```

Para que esto funcione, las tablas `orders` deben estar en la publication `supabase_realtime`. Las migraciones canonicas en `supabase/migrations` aseguran este requisito para template y rollout. Estas migraciones:

- Habilita RLS en `orders`.
- Crea una policy de lectura para usuarios autenticados miembros del tenant.
- Agrega cada tabla `orders` existente a `supabase_realtime`.

`human_intervention_alerts` sigue el mismo patron: tiene policy de lectura para miembros activos del tenant, se publica en `supabase_realtime` y se escucha solo para `INSERT`. El provisionamiento futuro instala esta configuracion junto con la RPC de automatizacion conversacional.

## Refresco y fallback

Aunque Realtime es el canal principal, se mantiene un refresco de respaldo cada 30 segundos:

```txt
30000 ms
```

Esto evita perder alertas si:

- El WebSocket cae temporalmente.
- Realtime no alcanza a reconectar.
- El navegador suspende la pestana.
- Una tabla nueva aun no fue agregada a `supabase_realtime`.

Antes, la bandeja de pedidos hacia polling propio cada 20 segundos. Ahora la campana usa Realtime mas fallback de 30 segundos.

## Servicios usados

- Supabase Auth: identifica al usuario y permite saber a que tenant pertenece.
- Supabase Realtime: abre el WebSocket y emite cambios de Postgres.
- Postgres publication `supabase_realtime`: habilita que `orders` pueda emitir eventos.
- RLS de Postgres: limita lectura de eventos a usuarios asociados al tenant.
- Dashboard API: recarga la lista completa de pedidos despues de cada evento.
- Web Audio API: reproduce el sonido de alerta.
- Browser Notification API: muestra notificaciones nativas si el usuario concede permiso.

## Cambios que trae

- El restaurante ya no depende solo de mirar la bandeja manualmente.
- La campana funciona en cualquier seccion del dashboard.
- El usuario distingue pedidos nuevos por contador y panel.
- El sonido ayuda a detectar pedidos aunque el operador no este mirando la pantalla.
- Realtime acelera la llegada de alertas frente a polling tradicional.

## Limitantes actuales

- El sonido puede estar bloqueado hasta que el usuario interactue con la pagina, por reglas del navegador.
- Las notificaciones nativas solo funcionan si el usuario concede permiso.
- Realtime solo funciona en tablas agregadas a `supabase_realtime`.
- Si se crea un nuevo tenant con schema propio, su tabla `orders` debe quedar incluida en la publication.
- El frontend recibe el evento y despues consulta la API; no usa directamente el payload completo de Realtime.
- Si la pestana esta suspendida por el navegador, el fallback puede tardar mas.
- Los schemas que no tienen tabla `orders` no reciben notificaciones hasta que exista la estructura completa.

## Estado conceptual actual

La implementacion actual debe entenderse como un mecanismo de deteccion de pedidos, no como un sistema general de eventos de dominio:

- `orders` y `human_intervention_alerts` son las fuentes realtime observadas por WebSocket.
- `app_events` es un historial persistido consultado por HTTP, con un allowlist fijo de nombres de evento.
- `human_intervention_alerts` es una cola separada para handoff y decisiones operativas; todos sus tipos abiertos tienen copia de notificacion explicita.
- `messages` registra el transporte inbound/outbound de WhatsApp.
- el frontend combina Realtime, polling y estado local para decidir cuando mostrar o sonar una alerta.

Por lo tanto, un evento persistido en `app_events` no necesariamente produce sonido, y un cambio de estado de `orders` puede producir sonido aunque no exista un `app_event` equivalente.

## Pendiente: modelo estándar de eventos y notificaciones

### Eventos de dominio

Crear un modelo inmutable de eventos con, al menos:

- `event_id`, `tenant_id`, `aggregate_type`, `aggregate_id`, `event_type`, `occurred_at`,
- `actor_id`, `correlation_id`, `causation_id`, `schema_version` y `payload`.

Los eventos deben escribirse en la misma transaccion que el cambio de dominio. Un outbox permitiria publicar despues del commit, reintentar y evitar perder eventos cuando falle Realtime o un consumidor.

### Notificaciones operativas

Derivar una tabla de notificaciones desde los eventos de dominio, en vez de usar `app_events` directamente como campana. Esa tabla deberia permitir:

- destinatario o alcance por equipo,
- prioridad y categoria,
- `read`, `acknowledged`, `resolved` y asignacion,
- `dedupe_key`, reintentos y fecha de expiracion,
- referencias a pedido, conversacion y alerta humana.

### Canales de entrega

- usar Realtime Broadcast para entregar notificaciones nuevas con baja latencia,
- conservar la notificacion en Postgres para replay y auditoria,
- al reconectar, consultar solo eventos posteriores a un cursor (`event_id`/timestamp),
- mantener polling como reconciliacion de respaldo, no como fuente primaria.

### Politica de sonido

Deberian producir sonido y Browser Notification solo eventos accionables y de alta prioridad, por ejemplo:

- pedido nuevo esperando confirmacion del restaurante,
- comprobante pendiente de revision,
- reemplazo esperando respuesta,
- solicitud de humano o automatizacion desactivada,
- fallo de envio de una notificacion al cliente.

Eventos informativos como `whatsapp.customer_notification_sent`, pago confirmado o cambios normales del pedido deberian quedar en el historial o generar una alerta visual silenciosa.

La politica debe incluir preferencias por usuario, horario silencioso, deduplicacion por pedido/conversacion y fallback visual cuando el navegador bloquee audio.

## Mejoras futuras

- Crear automaticamente la policy y publication de Realtime al crear un tenant nuevo.
- Usar Realtime Broadcast con triggers server-side para mayor escalabilidad y control.
- Agregar preferencias de sonido por usuario.
- Permitir silenciar notificaciones por horario o por tipo de pedido.
- Mostrar una notificacion mas rica con nombre del cliente, total y tipo de entrega.
- Sincronizar el panel de notificaciones con una tabla persistente de eventos.
- Agregar pruebas end-to-end simulando llegada de pedido por webhook de WhatsApp.
- Separar el monitor de notificaciones en un hook dedicado, por ejemplo `useOrderNotifications`.
