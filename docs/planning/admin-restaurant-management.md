# Admin: gestion de restaurantes y miembros

## Objetivo

El admin de 42day puede crear restaurantes clientes, asignar usuarios, editar datos operativos, pausar/inactivar restaurantes y restablecer contrasenas sin entrar al tenant del restaurante.

Este flujo vive en la API del dashboard y se consume desde la pantalla admin del frontend cuando el usuario autenticado tiene `app_metadata.system_admin = true` o `app_metadata.role = "system_admin"`.

## Componentes

- `apps/api/src/routes/dashboard.ts`: endpoints admin y validacion de permisos.
- `apps/api/src/lib/supabase-rest.ts`: cliente REST con soporte RPC para funciones Postgres.
- `packages/db/migrations/0021_admin_restaurant_management.sql`: funcion `control.provision_restaurant_tenant(...)` para crear el tenant y su schema operativo.
- `control.get_tenant_admin_snapshot(...)`: RPC para leer sede y metricas de un tenant sin depender de que su schema este expuesto en Data API.
- `control.update_tenant_primary_location(...)`: RPC para editar la sede principal de un tenant sin depender de que su schema este expuesto en Data API.
- `apps/dashboard/src/App.tsx`: consola admin para crear restaurantes, editar estado/datos y gestionar usuarios.
- `apps/dashboard/src/api.ts`: cliente frontend para las rutas admin.

## Seguridad

- El frontend nunca recibe `SUPABASE_SERVICE_ROLE_KEY`.
- Toda operacion sensible pasa por `apps/api`, que valida el JWT del usuario con Supabase Auth.
- Solo usuarios con rol de sistema pueden usar estas rutas.
- La creacion y actualizacion de usuarios usa Supabase Auth Admin desde servidor.
- Borrar restaurante es soft-delete operativo: marca el tenant como `inactive`, apaga automatizacion e inactiva usuarios/canales. No elimina historicos.

## Provisionamiento de restaurante

El endpoint de creacion llama a `control.provision_restaurant_tenant(...)`.

La funcion:

- Inserta el registro en `control.tenants`.
- Crea el schema `tenant_<slug>`.
- Crea tablas base del restaurante: ubicaciones, productos, opciones, menus, clientes, conversaciones, pedidos, items, pagos, alertas y eventos.
- Habilita RLS en tablas del nuevo schema.
- Crea indices basicos para pedidos, conversaciones, productos y eventos.
- Agrega `orders` a Realtime si la publicacion existe.
- Crea una sede principal y un menu publicado para la fecha actual.
La funcion no intenta actualizar `pgrst.db_schemas` en runtime. Supabase bloquea `ALTER ROLE authenticator SET pgrst.db_schemas` cuando se ejecuta desde una RPC PostgREST, incluso con `service_role`. Por eso la consola admin usa RPCs en `control` para leer/editar sede y metricas de schemas nuevos.

Antes de usar el alta de restaurantes en un ambiente real, la migracion `0021_admin_restaurant_management.sql` debe estar aplicada en Supabase.

## Nota sobre Data API y schemas nuevos

La creacion de restaurantes desde el admin ya crea el schema fisico y permite gestionar restaurante, estado, usuarios, passwords, sede y metricas desde la consola admin.

Los endpoints existentes del dashboard del restaurante todavia consultan tablas usando `Accept-Profile: tenant_<slug>`. Para que un restaurante nuevo use todas las pantallas operativas existentes fuera de la consola admin, su schema debe estar expuesto en Data API o esos endpoints deben migrarse tambien a RPCs en `control`.

Esto no afecta el CRUD admin porque la consola no depende de exponer dinamicamente el schema nuevo.

## Endpoints

Base: `/dashboard/admin`

`GET /overview`

- Devuelve el total de restaurantes activos.
- Excluye el tenant interno `thaledon`.

`GET /restaurants`

- Lista restaurantes administrables.
- Incluye estado, schema, datos de sede, password default calculado, ruta de carta publica y miembros.

`POST /restaurants`

- Crea restaurante y opcionalmente owner inicial.
- Payload principal: `name`, `slug`, `timezone`, `currency`, `status`, `automationEnabled`, `locationName`, `locationAddress`, `locationPhone`, `deliveryFeeFixed`, `ownerEmail`, `ownerName`, `ownerPassword`.
- Si no se envia password de owner, se usa `<slug_normalizado>_42*password`.

`PATCH /restaurants/:tenantId`

- Edita datos del tenant y de la sede principal.
- Permite pausar/reactivar por `status`.
- Permite apagar automatizacion del tenant o sede.

`DELETE /restaurants/:tenantId`

- Inactiva restaurante, usuarios y canales relacionados.
- No borra schema ni historicos.

`POST /restaurants/:tenantId/members`

- Crea o vincula un usuario de Supabase Auth.
- Roles soportados: `encargado`, `trabajador`.
- Si no se envia password, se usa `<slug_normalizado>_42*password`.

`PATCH /restaurants/:tenantId/members/:userId`

- Cambia rol, estado y nombre visible del usuario.

`DELETE /restaurants/:tenantId/members/:userId`

- Inactiva la relacion usuario-restaurante.

`POST /restaurants/:tenantId/members/:userId/reset-password`

- Restablece contrasena del usuario.
- Si no se envia password, usa el default del restaurante.

## UI admin

La pantalla admin ahora muestra:

- Metricas globales: activos, pausados, inactivos y usuarios vinculados.
- Metricas operativas por restaurante: productos activos, platos en menu, pedidos de hoy, pendientes, completados, ingresos de hoy y ultimo pedido.
- Formulario de creacion de restaurante con owner inicial.
- Lista de restaurantes con estado, schema, usuarios y automatizacion.
- Panel de detalle para editar datos comerciales y operativos.
- Gestion de miembros: crear, cambiar rol, activar/pausar, quitar acceso y resetear password.
- Aviso de contrasena temporal copiable despues de crear owner, crear miembro o resetear password.

## Password default

Formato:

```text
<slug_normalizado>_42*password
```

Ejemplo:

```text
restaurante_demo_42*password
```

Este password debe tratarse como temporal. La mejora recomendada es obligar cambio de contrasena en el primer login o migrar a invitaciones por email cuando se configure correo real.

## Limitantes actuales

- No hay hard-delete de tenants ni schemas desde UI. Es intencional para evitar perdida accidental de historicos.
- No hay auditoria persistente de acciones admin.
- La UI no gestiona todavia canales de WhatsApp, facturacion, planes o limites comerciales.
- La busqueda de usuarios existentes en Supabase Auth pagina hasta 1.000 usuarios. Para mayor escala conviene un indice/perfil propio en una tabla administrada.
- Las pantallas operativas del restaurante para tenants recien creados requieren exponer su schema en Data API o migrar esos endpoints a RPCs `control`.

## Mejoras futuras

- Invitaciones por email con expiracion en vez de compartir passwords temporales.
- Auditoria de eventos admin en `control.admin_events`.
- Roles mas granulares: soporte, ventas, owner plataforma, owner restaurante.
- Administracion de canales WhatsApp por restaurante.
- Planes comerciales, estado de pago y limites de uso.
- Hard-delete asistido con backup/export previo y doble confirmacion.
- Pantalla de salud por tenant: Realtime, WhatsApp, pedidos recientes, errores de IA y consumo.
