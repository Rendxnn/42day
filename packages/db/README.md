# DB

Schema, migraciones y clientes de base de datos.

Responsabilidades:

- definir schema global y schemas por tenant,
- mantener migraciones SQL versionadas,
- clientes tipados,
- queries compartidas,
- seeds de desarrollo.

Decision actual: tenant isolation con schemas separados.

## Estado real hoy

- las migraciones viven en `packages/db/migrations`,
- el repo ya tiene migraciones SQL numeradas `0001` a `0025`,
- las mas recientes agregan cobertura de delivery y billing reutilizable por cliente con snapshot por orden,
- no existe todavia una configuracion operativa completa de Supabase CLI para aplicar migraciones pendientes desde el repo,
- tampoco existe aun un script oficial en `scripts/` o `package.json` para `status`, `dry-run` o `apply`.

Situacion real del remoto hoy:

- `supabase_migrations.schema_migrations` existe y ya tiene historial remoto,
- pero el historial remoto no esta alineado 1:1 con `packages/db/migrations`,
- hubo cambios de schema aplicados manualmente y luego fixes de compatibilidad puntuales,
- por eso `list_migrations` en Supabase no debe asumirse como reflejo fiel del repo hasta hacer una reconciliacion formal.

## Pendiente explicito

La implementacion y configuracion del sistema de migraciones Supabase sigue pendiente.

Objetivo deseado:

- inicializar `supabase/` en el repo con Supabase CLI,
- definir la carpeta canonica de migraciones y la convivencia con `packages/db/migrations`,
- bootstrapear `supabase_migrations.schema_migrations` en los ambientes existentes,
- agregar scripts de uso diario para aplicar solo migraciones pendientes,
- documentar el flujo de desarrollo para staging/produccion y evitar cambios manuales fuera de migraciones.

## Flujo actual

Hoy la realidad es mas manual que automatizada:

- se escriben migraciones SQL versionadas,
- se revisan y aplican conscientemente sobre Supabase,
- a veces se corrigen drift o emergencias con SQL puntual sobre remoto,
- luego se valida que API/dashboard sigan operando.

Esto funciona para la etapa actual del proyecto, pero no debe considerarse el estado final del workflow de base de datos.

## Regla operativa recomendada desde ahora

- evitar cambios directos sobre remoto salvo emergencia real,
- si se hace un cambio manual, capturarlo enseguida en una migracion versionada y reconciliar historial,
- converger cuanto antes a un flujo Supabase CLI con proyecto linkeado, migraciones canonicas y `db push` como unico camino normal de despliegue de schema.
