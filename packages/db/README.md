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
- el repo ya tiene migraciones SQL numeradas `0001` a `0023`,
- la mas reciente agrega configuracion de pagos por sede y limpia el camino legacy de `transfer_payment_instructions`,
- no existe todavia una configuracion operativa completa de Supabase CLI para aplicar migraciones pendientes desde el repo,
- tampoco existe aun un script oficial en `scripts/` o `package.json` para `status`, `dry-run` o `apply`.

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
- luego se valida que API/dashboard sigan operando.

Esto funciona para la etapa actual del proyecto, pero no debe considerarse el estado final del workflow de base de datos.
