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

## Login

El dashboard usa Supabase Auth directamente en frontend con `@supabase/supabase-js`.

Flujo:

1. el usuario inicia sesion con email y contrasena desde el dashboard,
2. Supabase Auth crea y persiste la sesion en el navegador,
3. el frontend manda el `access_token` como `Bearer` al API,
4. el API valida el token en `auth/v1/user`,
5. el API resuelve los tenants permitidos leyendo `control.tenant_users`.

Variables necesarias en frontend:

```txt
VITE_API_BASE_URL
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Variables necesarias en backend:

```txt
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
```

## Desarrollo local

El dashboard abre en la vista `Hoy`, pero requiere:

- una sesion valida en Supabase Auth,
- `control.tenant_users` con relacion activa hacia el tenant,
- API local corriendo para resolver permisos y operaciones.

```bash
corepack pnpm --filter @42day/dashboard dev
```

Para conectar con el Worker local, ejecutar tambien:

```bash
corepack pnpm --filter @42day/api dev
```

La vista `Subida inteligente` analiza fotos de menu con Gemini desde el API. La clave debe vivir en `apps/api/.dev.vars` como `GEMINI_API_KEY`; no se expone al frontend.

