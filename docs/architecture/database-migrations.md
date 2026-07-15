# Arquitectura de migraciones de base de datos

## Objetivo

Dejar claro como deben evolucionar los schemas en un sistema multi-tenant por schema separado sin mezclar:

- schema canonico de desarrollo,
- tenants reales ya provisionados,
- fixes de drift o emergencias.

## Modelo de schemas

### `control`

Schema global canonico.

Guarda:

- `tenants`
- `tenant_users`
- metadata global
- funciones de provisionamiento y soporte administrativo

### `tenant_template`

Template canonico de tenant.

Se usa como referencia estructural para:

- baseline canonico del schema tenant
- provisionamiento de nuevos tenants

Importante:

- no deberia tratarse como tenant de negocio permanente,
- idealmente deberia mantenerse vacio o lo mas limpio posible,
- debe mantenerse estructuralmente alineado con la intencion del producto.

### `tenant_demo`

Tenant sandbox/demo.

Se puede usar para:

- pruebas funcionales,
- demos controladas,
- verificaciones manuales del flujo vivo.

No debe ser la referencia canonica del schema tenant.

### `tenant_<slug>`

Instancia operativa de un restaurante ya provisionado.

No es fuente canonica de schema.

Puede tener drift si una migracion no le llego correctamente o si hubo SQL manual puntual.

## Conceptos clave

### Baseline canonico

Es la base que los developers usan para evolucionar el schema en el futuro.

Debe representar:

- `control`
- `tenant_template`

No debe incluir todos los tenants historicos como si cada uno fuera parte de la definicion canonica del sistema.

### Rollout operativo

Es la parte de una migracion que actualiza tenants ya existentes en un ambiente real.

Una migracion tenant-profesional debe:

1. cambiar el template tenant,
2. recorrer tenants existentes,
3. aplicar el cambio de forma idempotente,
4. refrescar exposicion/API cuando corresponda.

### Drift operativo

Ocurre cuando un tenant real no coincide con la estructura que deberia tener.

Causas comunes:

- SQL manual en remoto
- migracion parcial
- loops que fallaron a mitad de rollout
- tenant provisionado desde un template viejo
- template actualizado sin actualizar tenants ya existentes

### Reconciliacion de drift

Proceso para alinear tenants reales con la estructura esperada.

Puede incluir:

- migraciones correctivas
- SQL one-shot de reparacion
- scripts de validacion por schema

No debe confundirse con el baseline canonico.

## Provisionamiento de nuevos tenants

Hoy el alta de restaurantes usa `control.provision_restaurant_tenant(...)`.

El flujo actual:

1. crea fila en `control.tenants`
2. crea schema `tenant_<slug>`
3. clona tablas base desde `tenant_template`
4. reconstruye foreign keys
5. habilita RLS y grants
6. crea sede principal
7. crea menu inicial
8. refresca PostgREST

Las funciones tenant-locales no se copian automaticamente junto con las tablas. Cuando una capacidad necesita una RPC por tenant, la migracion debe crearla para `tenant_template`, hacer rollout a los tenants existentes y enganchar el provisionamiento futuro. La migracion de automatizacion de conversaciones usa un trigger diferido sobre `control.tenants`: despues de que `provision_restaurant_tenant` termina de crear el schema, instala la RPC, la policy de lectura de alertas y su tabla en `supabase_realtime` dentro de la misma transaccion de provisionamiento.

Decision pragmatica:

- mantener el modelo de clonacion desde template,
- no reprovisionar un tenant nuevo re-ejecutando toda la historia de migraciones.

## Como deben verse las migraciones tenant

Cuando el cambio afecta tablas tenant, la migracion debe cubrir dos necesidades:

### A. Futuro

Actualizar `tenant_template` para que futuros tenants nazcan correctos.

### B. Presente

Actualizar todos los tenants existentes para que no queden atrasados.

Patron recomendado:

1. asegurar cambio en `tenant_template`
2. iterar tenants desde `control.tenants`
3. aplicar `alter table`, `create table`, `create index`, `drop/add constraint`
4. usar `if exists` y `if not exists`
5. emitir `notify pgrst, 'reload schema'` si cambia exposicion consumida por REST

Para cambios que ya tuvieron una migracion aplicada, no se edita esa migracion: se crea una migracion forward idempotente. Es importante para poder repetir el rollout y conservar una historia reproducible de los ambientes.

## Flujo recomendado de desarrollo

### Carpeta canonica

Las migraciones nuevas deben vivir en:

- `supabase/migrations`

La carpeta `packages/db/migrations` queda como referencia legacy de la etapa anterior y no recibe nuevas migraciones canonicas. Sus archivos no son instrucciones operativas para ambientes nuevos.

### Baseline inicial Supabase CLI

La baseline canonica debe salir de:

- `control`
- `tenant_template`

No de todos los `tenant_<slug>` existentes.

### Cambio nuevo de schema

1. crear nueva migracion
2. escribir SQL del cambio
3. actualizar `control` si hace falta
4. actualizar `tenant_template`
5. hacer rollout a tenants existentes
6. probar localmente
7. aplicar por CLI a staging/prod
8. validar que no quedo drift

## Testing y ambientes

### Mala practica relativa

Usar `tenant_template` como tenant de pruebas del dia a dia no es ideal porque:

- mezcla template con datos de sandbox,
- puede dejar menus/clientes/conversaciones que no representan un template limpio,
- hace mas confuso razonar sobre drift.

### Practica recomendada

- conservar `tenant_template` como template estructural,
- usar `tenant_demo` como sandbox funcional actual o crear otro sandbox separado,
- borrar y reprovisionar tenants sandbox cuando haga falta.

## Seeds

Estado actual:

- todavia no existe un seed canonico del proyecto integrado al flujo normal de Supabase CLI,
- `supabase/seed.sql` existe solo como placeholder tecnico minimo,
- los datos demo/legacy siguen fuera de ese flujo y viven en `packages/db/seeds/` solo como referencia; no deben ejecutarse como provisioning actual.

Decision por ahora:

- no tratar ese placeholder como seed oficial del producto,
- cuando definamos un seed real, debe hacerse como trabajo separado y documentado.

## Regla de emergencia

Si una correccion debe hacerse manualmente en remoto:

1. aplicar el fix necesario
2. capturarlo enseguida en migracion o baseline canonica
3. reconciliar historial de migraciones
4. documentar por que fue necesario

## Checklist para cambios tenant

- el cambio existe en `tenant_template`
- el cambio llega a tenants existentes
- el provisioning sigue clonando estructura correcta
- `control.provision_restaurant_tenant` sigue vigente si el cambio afecta onboarding
- se valido que no hay drift obvio en tenants activos
