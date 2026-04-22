# Onboarding de nuevos clientes

## Por que existen `control` y `tenant_demo`

### `control`

Es el plano global del sistema.

Guarda informacion transversal:

- restaurantes/tenants,
- que schema usa cada tenant,
- que canal de WhatsApp pertenece a cada tenant,
- usuarios del dashboard asociados a cada tenant,
- webhooks raw antes de saber completamente como procesarlos.

Ejemplo:

```txt
control.tenants
control.tenant_channels
control.tenant_users
control.webhook_events
```

### `tenant_demo`

Es el plano operativo de un restaurante concreto.

Guarda datos propios de ese restaurante:

- productos,
- combos,
- menus,
- clientes,
- conversaciones,
- mensajes,
- drafts,
- ordenes,
- comprobantes,
- alertas.

En produccion, cada cliente tendra su propio schema:

```txt
tenant_demo
tenant_la_arepera
tenant_sushi_centro
tenant_pollos_norte
```

## Flujo al recibir un mensaje

1. Meta envia webhook con `phone_number_id`.
2. El backend consulta `control.tenant_channels`.
3. Encuentra el tenant asociado.
4. Lee `control.tenants.schema_name`.
5. Usa ese schema para operar datos del restaurante.

Ejemplo:

```txt
phone_number_id=123
-> control.tenant_channels
-> tenant_id=abc
-> control.tenants.schema_name=tenant_demo
-> consultar tenant_demo.conversations, tenant_demo.menus, tenant_demo.orders
```

## Como se crea un nuevo cliente

En una version madura, esto debe ser una operacion interna de administracion.

Pasos:

1. Crear fila en `control.tenants`.
2. Crear schema dedicado: `tenant_<slug>`.
3. Ejecutar migraciones tenant dentro de ese schema.
4. Crear sede inicial.
5. Crear bucket/rutas si se requieren convenciones por tenant.
6. Registrar canal WhatsApp en `control.tenant_channels`.
7. Crear usuarios dashboard en Supabase Auth.
8. Asociar usuarios en `control.tenant_users`.
9. Configurar datos operativos:
   - domicilio fijo,
   - horarios,
   - datos de transferencia,
   - menu inicial.
10. Activar `automation_enabled`.

## Donde se ejecutaria esto

### MVP temprano

Lo ejecutamos nosotros con script o MCP:

```txt
admin/dev -> script interno -> Supabase
```

### Producto mas maduro

Puede existir un dashboard interno de desarrolladores/admin:

```txt
admin dashboard -> endpoint backend -> job onboarding -> Supabase
```

Ese dashboard no seria el dashboard del restaurante. Seria un panel interno para nosotros como operadores del SaaS.

## Recomendacion

Para el MVP:

- mantener onboarding manual/asistido por script,
- no construir todavia un dashboard interno,
- documentar cada paso,
- automatizar cuando tengamos el segundo o tercer cliente real.

Cuando ya duela hacerlo manual, se crea:

```txt
POST /admin/tenants
```

Ese endpoint debe:

- validar slug,
- crear tenant,
- crear schema,
- aplicar migraciones,
- crear sede,
- registrar canal,
- dejar logs de onboarding.
