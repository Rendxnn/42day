# Onboarding de nuevos clientes

## Por que existen `control` y los schemas tenant

### `control`

Es el plano global del sistema.

Guarda informacion transversal:

- restaurantes/tenants,
- que schema usa cada tenant,
- que canal de WhatsApp pertenece a cada tenant,
- usuarios del dashboard asociados a cada tenant,
- webhooks raw antes de saber completamente como procesarlos.

### `tenant_<slug>`

Es el plano operativo de un restaurante concreto.

Guarda datos propios de ese restaurante:

- productos,
- opciones,
- menus,
- clientes,
- conversaciones,
- mensajes,
- drafts,
- ordenes,
- alertas,
- eventos.

## Flujo al recibir un mensaje

1. Meta envia webhook con `phone_number_id`.
2. El backend consulta `control.tenant_channels`.
3. Encuentra el tenant asociado.
4. Lee `control.tenants.schema_name`.
5. Usa ese schema para operar datos del restaurante.

## Como se crea un nuevo cliente hoy

El onboarding ya no es solo manual por SQL.

Hoy existe una consola admin y una RPC de provisionamiento que permiten:

1. crear fila en `control.tenants`,
2. crear schema dedicado `tenant_<slug>`,
3. clonar tablas base del tenant desde `tenant_template`,
4. crear sede principal,
5. crear menu inicial,
6. crear o asociar usuarios,
7. configurar estado y automatizacion inicial.

Punto clave:

- `tenant_template` debe ser el template de provisionamiento.
- `tenant_demo` puede vivir como tenant de pruebas funcionales sin contaminar el template.
- los tenants reales creados para clientes no deberian convertirse en la referencia de schema canonica.

Documentacion relacionada:

- [Admin: gestion de restaurantes y miembros](../planning/admin-restaurant-management.md)
- [Arquitectura de migraciones de base de datos](./database-migrations.md)

## Limite actual importante

El alta del tenant ya crea el schema fisico y permite operarlo desde la consola admin.

Sin embargo, varias pantallas operativas del dashboard del restaurante siguen dependiendo de que el schema este expuesto en Data API. Por eso:

- el provisionamiento administrativo ya funciona,
- pero un tenant nuevo puede requerir pasos adicionales de exposicion o evolucion de endpoints para usar todas las pantallas operativas existentes.

## Checklist recomendado para demos

- tenant creado,
- sede activa,
- menu publicado,
- usuarios creados,
- canal WhatsApp asociado,
- automatizacion activada cuando corresponda,
- schema expuesto si la pantalla operativa lo requiere.

## Recomendacion operativa

- evitar usar `tenant_template` como tenant operativo o de pruebas del dia a dia.
- `tenant_demo` puede seguir como sandbox activo mientras el template quede separado.
- si en el futuro el sandbox crece demasiado, preferir provisionar otro tenant descartable para pruebas funcionales.
