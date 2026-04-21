# API

Backend principal del sistema.

Stack previsto:

- Cloudflare Workers
- Hono
- Supabase Postgres
- Drizzle ORM
- WhatsApp Cloud API

Responsabilidades:

- verificar webhook de Meta,
- recibir mensajes entrantes,
- normalizar payloads,
- resolver tenant,
- registrar mensajes/eventos,
- enrutar conversaciones,
- manejar flujo guiado,
- llamar parser semantico cuando aplique,
- validar y calcular pedidos,
- crear ordenes finales,
- exponer endpoints para el dashboard.

La implementacion real debe iniciar por el webhook y logging de mensajes antes de construir el flujo completo.

