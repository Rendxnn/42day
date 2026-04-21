# Supabase

## Que es

Supabase es una plataforma que ofrece Postgres administrado, Auth, storage, APIs y herramientas de administracion.

Para este proyecto lo usaremos principalmente como:

- base de datos Postgres,
- Auth para dashboard,
- panel para inspeccionar datos,
- Storage para comprobantes de transferencia y archivos operativos.

## Donde se aloja

Supabase se aloja en la nube de Supabase. Se crea un proyecto desde el dashboard de Supabase y ellos administran la instancia Postgres.

El backend en Cloudflare Workers se conecta usando variables:

```txt
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
```

El dashboard puede usar:

```txt
SUPABASE_URL
SUPABASE_ANON_KEY
```

## Service role vs anon key

### `SUPABASE_ANON_KEY`

Se puede usar en frontend junto con RLS.

Debe tener permisos limitados.

### `SUPABASE_SERVICE_ROLE_KEY`

Solo backend.

Tiene permisos altos y puede saltarse RLS.

Nunca debe exponerse en frontend.

## Como encaja con nuestro backend

El backend no mete "logica dentro de Supabase" para el flujo conversacional.

La logica vive en:

```txt
apps/api
packages/core
```

Supabase guarda:

- tenants,
- menus,
- conversaciones,
- mensajes,
- drafts,
- ordenes,
- alertas,
- logs.

## Auth

Supabase Auth puede manejar login del dashboard.

Modelo:

- usuarios existen en `auth.users`,
- relacion con tenant y rol en `control.tenant_users`,
- roles iniciales: `encargado`, `trabajador`.

Regla sugerida:

- `encargado`: administra menu, usuarios, configuracion y ordenes.
- `trabajador`: ve ordenes, atiende alertas y cambia estados operativos.

## Schemas separados

Usaremos:

```txt
control
tenant_demo
tenant_<slug>
```

`control` guarda datos globales.

Cada tenant tiene sus tablas operativas.

## Configuracion inicial recomendada

1. Crear proyecto Supabase.
2. Copiar `SUPABASE_URL`.
3. Copiar `SUPABASE_ANON_KEY`.
4. Copiar `SUPABASE_SERVICE_ROLE_KEY`.
5. Obtener connection string Postgres para `DATABASE_URL`.
6. Crear schema `control`.
7. Crear tenant demo.
8. Crear schema `tenant_demo`.
9. Correr migraciones.
10. Crear usuario demo en Supabase Auth.
11. Asociar usuario demo al tenant en `control.tenant_users`.

## Storage

Usaremos Supabase Storage desde V1 para:

- comprobantes de transferencia,
- imagenes de productos,
- menus cargados por el restaurante.

Para comprobantes:

1. WhatsApp entrega un `media_id`.
2. El Worker descarga el archivo desde Meta usando `META_ACCESS_TOKEN`.
3. El Worker lo sube a Supabase Storage.
4. Postgres guarda metadata en `payment_proofs`.
5. Se crea una alerta `transfer_payment_review`.
6. La orden queda en `payment_pending_review`.

Bucket sugerido:

```txt
payment-proofs
```

Rutas sugeridas:

```txt
tenant_<slug>/<yyyy>/<mm>/<order_id>/<message_id>.<ext>
```

## RLS

Si el dashboard consulta directo Supabase:

- RLS debe estar bien configurado.
- Cada usuario solo ve su tenant.

Si el dashboard consulta solo a nuestro API:

- el API aplica permisos,
- RLS sigue siendo recomendable, pero el control principal queda en backend.

Recomendacion para MVP: dashboard consume API del backend para operaciones sensibles como ordenes, menu y alertas.

## Dashboard via API vs Supabase directo

### Solo API

El dashboard llama a nuestro backend y el backend habla con Supabase.

Ventajas:

- una sola capa aplica reglas de negocio,
- no se expone estructura interna de la DB,
- mas facil cambiar schema sin romper frontend,
- permisos por rol mas simples de centralizar,
- mejor para operaciones sensibles como crear ordenes, cambiar estados y revisar pagos.

Costos:

- hay que construir mas endpoints,
- un poco mas de trabajo inicial,
- si el API falla, el dashboard queda limitado.

### Supabase directo

El dashboard llama directamente a Supabase usando `SUPABASE_ANON_KEY` y RLS.

Ventajas:

- desarrollo rapido en pantallas CRUD,
- realtime/listeners mas directo,
- menos endpoints propios para lecturas simples.

Costos:

- RLS debe estar impecable,
- el frontend queda mas acoplado al schema,
- reglas de negocio pueden terminar duplicadas,
- operaciones multi-schema por tenant se vuelven mas delicadas,
- es mas facil exponer datos si se configura mal.

### Recomendacion para este proyecto

Usar enfoque mixto con prioridad API:

- API para ordenes, pagos, alertas, conversaciones, mensajes y cambios de estado.
- Supabase directo solo si se decide usar Auth, realtime o lecturas simples muy controladas.
- Para CRUD de menu se puede empezar por API para mantener reglas consistentes.
