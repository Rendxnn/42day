# Supabase vs Cloudflare Workers

## Resumen corto

Cloudflare Workers ejecuta la logica.

Supabase guarda los datos, usuarios y archivos.

## Que vive en Cloudflare Workers

El Worker es nuestro backend HTTP.

Vive ahi:

- webhook de WhatsApp,
- validacion del challenge de Meta,
- normalizacion de mensajes,
- resolucion de tenant,
- orquestacion del flujo conversacional,
- llamadas al parser semantico,
- validacion deterministica,
- calculo de precios,
- creacion de ordenes,
- handoff humano,
- endpoints para dashboard,
- descarga de comprobantes desde Meta,
- subida de comprobantes a Supabase Storage.

Archivos relacionados:

```txt
apps/api/src
apps/api/wrangler.toml
```

Configuracion externa:

- proyecto Cloudflare,
- secrets del Worker,
- dominio o URL publica,
- deploy/staging/production.

## Que vive en Supabase

Supabase es la capa de datos.

Vive ahi:

- Postgres,
- schemas `control` y `tenant_<slug>`,
- tenants,
- menus,
- productos,
- configurables de producto,
- conversaciones,
- mensajes,
- drafts,
- ordenes,
- alertas humanas,
- logs estructurados,
- usuarios de dashboard con Supabase Auth,
- archivos en Supabase Storage.

Archivos relacionados:

```txt
packages/db/src
packages/db/migrations
```

Configuracion externa:

- proyecto Supabase,
- connection string,
- API keys,
- Auth settings,
- Storage buckets,
- politicas RLS si se consulta directo desde frontend.

## Diferencia practica

Supabase responde la pregunta:

```txt
Que datos existen y como se guardan?
```

Cloudflare Worker responde:

```txt
Que hacemos cuando pasa algo?
```

Ejemplo:

1. Llega mensaje por WhatsApp.
2. Meta llama al Worker.
3. Worker valida, interpreta y decide.
4. Worker guarda mensaje en Supabase.
5. Worker consulta menu en Supabase.
6. Worker calcula respuesta.
7. Worker envia mensaje por WhatsApp.

Nota de estado actual:

- la infraestructura y el flujo end-to-end de comprobantes ya estan implementados,
- el gap demo-ready ya no es el archivo ni el estado de pago, sino la consola humana para atender alertas y conversaciones manuales.

## Configuracion: codigo vs servicio externo

### En codigo

```txt
.env.example
apps/api/wrangler.toml
packages/db/migrations
packages/config/src/env.ts
```

Define:

- nombres de variables,
- rutas del Worker,
- schema de base de datos,
- validacion de configuracion.

### En servicios externos

Cloudflare:

- crear cuenta/proyecto,
- configurar Worker,
- guardar secrets,
- configurar dominio,
- desplegar.

Supabase:

- crear proyecto,
- crear schemas mediante migraciones,
- configurar Auth,
- configurar Storage,
- obtener keys.

Meta:

- crear app,
- activar WhatsApp,
- configurar webhook URL,
- configurar verify token,
- obtener access token y phone number ID.

## Costos e implicaciones

### Cloudflare Workers + Supabase

Ventajas:

- muy bajo mantenimiento de infraestructura,
- despliegue rapido,
- escala bien para webhooks,
- Postgres administrado,
- Auth y Storage incluidos,
- buen encaje para MVP.

Costos/implicaciones:

- limites propios de plataformas serverless,
- conexiones directas a Postgres deben manejarse con cuidado,
- algunas tareas largas conviene moverlas a colas luego,
- dependes de dos proveedores.

### Backend propio alojado por nosotros

Ejemplos:

- VPS,
- Render/Fly/Railway,
- EC2,
- contenedor propio.

Ventajas:

- mas control sobre runtime,
- procesos largos mas faciles,
- conexiones persistentes mas naturales,
- menos restricciones serverless.

Costos/implicaciones:

- mas DevOps,
- parches, monitoreo, logs, escalado y backups dependen mas de ustedes,
- mayor riesgo operativo si el equipo es pequeno,
- hay que configurar seguridad, deploys, procesos, reinicios y base de datos.

## Recomendacion actual

Para este MVP:

- Cloudflare Workers para webhook y API.
- Supabase para datos, auth y storage.
- Evitar backend propio hasta que haya una razon clara.

Razones:

- webhook de WhatsApp necesita respuesta rapida,
- el flujo es principalmente HTTP/event-driven,
- el equipo puede avanzar mas rapido,
- hay menos infraestructura que mantener.
