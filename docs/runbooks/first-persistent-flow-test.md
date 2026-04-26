# Primera prueba con persistencia conversacional

Objetivo:

```txt
WhatsApp
-> Cloudflare Worker
-> Supabase control.webhook_events
-> tenant_demo.customers
-> tenant_demo.conversations
-> tenant_demo.messages
-> respuesta WhatsApp
```

## 1. Confirmar SQL pendiente en Supabase

Estado actual:

- `business_config_and_addresses` ya fue aplicado por MCP.
- `enable_rls_for_exposed_tables` ya fue aplicado por MCP.
- `menu_demo.sql` ya fue ejecutado por MCP.

Solo repetir esta seccion si estas creando un proyecto nuevo o reseteando la base.

Desde Supabase Dashboard:

1. Abrir el proyecto.
2. Ir a `SQL Editor`.
3. Crear una nueva query.
4. Pegar y ejecutar el contenido de:

```txt
packages/db/migrations/0009_business_config_and_addresses.sql
```

Luego crear otra query, pegar y ejecutar:

```txt
packages/db/seeds/menu_demo.sql
```

Si el MCP de Supabase esta disponible para Codex, estos pasos los puede ejecutar Codex.

## 2. Desplegar el Worker staging

Ejecutar desde la raiz del repo:

```powershell
corepack pnpm --filter @42day/api exec wrangler deploy --env staging
```

Este comando sube el backend actualizado a Cloudflare Workers usando el ambiente `staging`.

## 3. Probar salud del Worker

En PowerShell, si `curl` falla por TLS, usar:

```powershell
Invoke-RestMethod "https://42day-api-staging.42day.workers.dev/health"
```

Respuesta esperada:

```json
{
  "ok": true,
  "service": "42day-api",
  "env": "staging"
}
```

## 4. Enviar mensaje desde WhatsApp

Desde el telefono tester escribir al numero demo:

```txt
hola
```

Respuesta esperada:

```txt
Hola, te ayudo con tu pedido. Puedes ver el menu, hacer pedido guiado, escribirlo como quieras o hablar con alguien del restaurante.
```

## 5. Verificar datos en Supabase

En `SQL Editor`, ejecutar:

```sql
select
  status,
  processed_at,
  provider_message_id,
  received_at
from control.webhook_events
order by received_at desc
limit 10;
```

Esperado:

- eventos nuevos con `status = processed`,
- `processed_at` con fecha.

```sql
select
  id,
  phone,
  created_at
from tenant_demo.customers
order by created_at desc
limit 10;
```

Esperado:

- un customer con el telefono del tester.

```sql
select
  id,
  customer_id,
  state,
  last_inbound_at,
  expires_at,
  created_at
from tenant_demo.conversations
order by created_at desc
limit 10;
```

Esperado:

- conversation con `state = awaiting_mode_selection`,
- `expires_at` cerca de 30 minutos despues del ultimo mensaje.

```sql
select
  direction,
  provider_message_id,
  message_type,
  text,
  status,
  created_at
from tenant_demo.messages
order by created_at desc
limit 20;
```

Esperado:

- un mensaje inbound `hola`,
- un mensaje outbound con la respuesta del bot.

## 6. Probar ubicacion WhatsApp

Desde WhatsApp enviar una ubicacion al numero demo.

Luego ejecutar:

```sql
select
  address_text,
  latitude,
  longitude,
  source,
  is_default,
  created_at
from tenant_demo.customer_addresses
order by created_at desc
limit 10;
```

Esperado:

- una direccion con `source = whatsapp_location`,
- `latitude` y `longitude` llenos.

## 7. Si algo falla

Revisar en este orden:

1. Logs del Worker en Cloudflare.
2. `control.webhook_events.error_message`.
3. Que existan secrets de Cloudflare:
   - `META_VERIFY_TOKEN`
   - `META_ACCESS_TOKEN`
   - `META_PHONE_NUMBER_ID`
   - `META_WABA_ID`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Que `control.tenant_channels.phone_number_id` coincida con el `META_PHONE_NUMBER_ID`.
5. Que las migraciones `business_config_and_addresses` y `enable_rls_for_exposed_tables` ya esten aplicadas.
