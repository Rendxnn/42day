# Dashboard

Aplicacion web del restaurante para operar el menu diario que consume el chatbot de WhatsApp.

## Stack

- React + Vite
- TailwindCSS
- Tipos compartidos desde `@42day/types`

## Contrato V1

El dashboard trabaja contra el schema tenant resuelto por el backend:

- catalogo: `tenant_<slug>.products`
- menu del dia: `tenant_<slug>.menus`
- platos del dia: `tenant_<slug>.menu_items`
- imagenes: bucket publico `product-images` y URL persistida en `tenant_<slug>.products.image_url`

El dashboard no debe simular guardado persistente cuando el API esta caido. Si una escritura falla, el usuario ve error y el producto no se agrega temporalmente.

Endpoints usados:

- `GET /dashboard/:tenantSlug/menu/today`
- `POST /dashboard/:tenantSlug/products`
- `PATCH /dashboard/:tenantSlug/products/:productId`
- `DELETE /dashboard/:tenantSlug/products/:productId`
- `POST /dashboard/:tenantSlug/menu/today/items`
- `PATCH /dashboard/:tenantSlug/menu/today/items/:itemId`
- `DELETE /dashboard/:tenantSlug/menu/today/items/:itemId`

## Desarrollo local

El dashboard usa `VITE_TENANT_SLUG=demo` por defecto.
Si el endpoint `GET /dashboard/tenants` responde, el selector de restaurante usa los tenants activos de `control.tenants`.
Si el API no esta corriendo, cae a tenants locales de prueba:

- `demo` -> `tenant_demo`
- `arepas` -> `tenant_arepas`
- `pizza` -> `tenant_pizza`

```bash
corepack pnpm --filter @42day/dashboard dev
```

Para conectar con el Worker local, ejecutar tambien:

```bash
corepack pnpm --filter @42day/api dev
```

