# DB

Schema, migraciones y clientes de base de datos.

Responsabilidades:

- definir schema global y schemas por tenant,
- mantener migraciones SQL versionadas,
- clientes tipados,
- queries compartidas,
- seeds de desarrollo.

Decision actual: tenant isolation con schemas separados.

## Modelo canonico recomendado

- `control`: schema global canonico
- `tenant_template`: template canonico de tenant
- `tenant_demo`: sandbox/demo tenant para pruebas funcionales
- `tenant_<slug>`: instancia operativa de un cliente ya provisionado

Consecuencia importante:

- las migraciones canonicas para desarrollo futuro deben describir `control` y el template tenant,
- los demas tenant schemas no deben ser la fuente de verdad del baseline,
- pero si deben recibir rollout cuando una migracion cambia estructura tenant.

## Estado real hoy

- la carpeta canonica para nuevas migraciones debe ser `supabase/migrations`,
- `packages/db/migrations` queda como archivo historico legacy del periodo previo a la reconciliacion Supabase CLI y no es ejecutable como workflow actual,
- el repo ya tiene migraciones SQL numeradas `0001` a `0025`,
- las mas recientes agregan cobertura de delivery y billing reutilizable por cliente con snapshot por orden,
- el repo ya tiene baseline Supabase y migraciones forward reales en `supabase/migrations`,
- todavia no existen scripts oficiales en `package.json` para `status`, `dry-run` o `apply`.

Situacion real del remoto hoy:

- `supabase_migrations.schema_migrations` existe y ya tiene historial remoto,
- pero el historial remoto no esta alineado 1:1 con `packages/db/migrations`,
- hubo cambios de schema aplicados manualmente y luego fixes de compatibilidad puntuales,
- por eso `list_migrations` en Supabase no debe asumirse como reflejo fiel del repo hasta hacer una reconciliacion formal.

## Baseline vs rollout

Hay dos necesidades distintas y no deben confundirse:

### 1. Baseline canonico

Es la base que usa el equipo para evolucionar schema en el futuro.

Debe reflejar:

- `control`
- `tenant_template`

No debe congelar todos los `tenant_<slug>` historicos como si fueran schema canonico.

### 2. Rollout operativo

Es la aplicacion de cambios estructurales a tenants ya existentes en una base remota.

Una migracion tenant-profesional debe:

- actualizar el template tenant,
- recorrer `control.tenants` para actualizar tenants existentes,
- usar SQL idempotente siempre que sea posible (`if exists`, `if not exists`),
- refrescar exposicion PostgREST si corresponde.

Esto permite que:

- futuros tenants nazcan con la estructura nueva por clonacion del template,
- tenants actuales queden alineados sin reprovisionarlos.

## Pendiente explicito

La implementacion y configuracion del sistema de migraciones Supabase sigue pendiente.

Objetivo deseado:

- inicializar `supabase/` en el repo con Supabase CLI,
- mantener `supabase/migrations` como carpeta canonica y documentar solo la referencia legacy,
- bootstrapear `supabase_migrations.schema_migrations` en los ambientes existentes,
- agregar scripts de uso diario para aplicar solo migraciones pendientes,
- documentar el flujo de desarrollo para staging/produccion y evitar cambios manuales fuera de migraciones.

## Flujo actual

Flujo recomendado desde ahora:

1. crear nueva migracion en `supabase/migrations`
2. si el cambio es tenant-scoped:
   - actualizar `tenant_template`
   - hacer rollout a tenants existentes
3. probar localmente o en branch/sandbox cuando aplique
4. aplicar con `supabase db push`
5. validar schema remoto y comportamiento de API/dashboard

`packages/db/migrations` no recibe nuevas migraciones canonicas. Se conserva como referencia historica; el workflow actual se define en `docs/architecture/database-migrations.md`.

Nota sobre seeds:

- hoy no existe un seed canonico del proyecto para Supabase CLI,
- `supabase/seed.sql` existe solo como placeholder minimo para que `supabase db reset` no falle,
- los seeds demo legacy siguen viviendo en `packages/db/seeds/`,
- migrar esos seeds al flujo canonico de Supabase queda como trabajo posterior y debe hacerse de forma intencional, separado del baseline de schema.

## Regla operativa recomendada desde ahora

- evitar cambios directos sobre remoto salvo emergencia real,
- si se hace un cambio manual, capturarlo enseguida en una migracion versionada y reconciliar historial,
- converger cuanto antes a un flujo Supabase CLI con proyecto linkeado, migraciones canonicas y `db push` como unico camino normal de despliegue de schema.
- no usar `tenant_template` como sandbox de datos operativos permanentes; reservarlo como template estructural,
- mantener `tenant_template` lo mas limpio posible y dejar el testing funcional en `tenant_demo` u otros sandboxes descartables.
