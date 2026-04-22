# Plan de trabajo adelantable

## Objetivo

Avanzar todo lo posible mientras se configuran Meta, Supabase y Cloudflare, sin depender de credenciales reales.

## Lo que se puede adelantar ya

### Backend

- Crear app Hono para Cloudflare Workers.
- Definir rutas base:
  - `GET /health`
  - `GET /webhooks/whatsapp`
  - `POST /webhooks/whatsapp`
- Definir validacion de variables de entorno.
- Definir tipos compartidos del dominio.
- Crear normalizador de payloads WhatsApp.
- Crear esqueleto de `tenant_resolver`.
- Crear esqueleto de `conversation_service`.
- Crear esqueleto de `message_router`.
- Crear esqueleto de `handoff_service`.
- Crear cliente WhatsApp para envio de mensajes.
- Definir contratos de logging.
- Crear migraciones SQL iniciales.
- Crear seed SQL para tenant demo.

### Base de datos

- Definir schema `control`.
- Definir schema `tenant_demo`.
- Definir tablas iniciales.
- Definir indices de idempotencia.
- Definir estructura de `payment_proofs`.
- Definir bucket esperado para comprobantes.

### Frontend/dashboard

Mientras backend se configura, frontend puede avanzar con mocks basados en contratos:

- lista de ordenes,
- detalle de orden,
- alertas humanas,
- CRUD productos,
- CRUD combos,
- CRUD promociones,
- menu del dia,
- login/roles.

### Documentacion

- Guia de Supabase.
- Guia de Cloudflare Worker.
- Guia de Meta WhatsApp.
- Guia de variables de entorno.
- Lista de decisiones pendientes.

## Orden recomendado de ejecucion

1. Montar esqueleto de API.
2. Montar tipos compartidos.
3. Montar migraciones SQL.
4. Configurar Supabase.
5. Configurar Cloudflare Worker staging.
6. Configurar webhook en Meta.
7. Probar inbound.
8. Probar outbound.
9. Conectar tenant demo.
10. Conectar flujo conversacional base.

## Decisiones bloqueantes para flujo completo

Estas no bloquean el webhook inicial, pero si bloquean el flujo comercial completo:

- datos minimos de direccion valida,
- reglas exactas de promociones,
- horarios de atencion,
- zonas/cobertura de domicilio,
- texto final de mensajes automaticos,
- permisos exactos por rol,
- notificaciones del dashboard,
- cantidad de intentos antes de handoff,
- como se corrige un pedido ya confirmado.

## Filosofia de implementacion

- Primero registrar todo.
- Luego responder mensajes simples.
- Luego manejar estado conversacional.
- Luego crear drafts.
- Luego crear ordenes.
- Luego parser semantico.

Esto evita construir IA o flujos complejos antes de tener observabilidad e idempotencia.
