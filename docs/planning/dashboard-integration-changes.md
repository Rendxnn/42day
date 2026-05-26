# Dashboard integration changes

## Scope

This work integrated the restaurant dashboard into the existing GitHub monorepo and connected it to the current multi-tenant database model.

The existing WhatsApp chatbot flow logic was not changed. No edits were made to:

- `apps/api/src/modules/whatsapp-webhook/*`
- `apps/api/src/modules/message-router/*`
- `apps/api/src/modules/conversation-service/*`
- `apps/api/src/modules/order-service/*`
- `apps/api/src/modules/draft-order-service/*`
- `apps/api/src/modules/semantic-parser/*`
- `apps/api/src/modules/guided-flow-engine/*`

## What changed

### Dashboard app

Created `apps/dashboard` as a React + Vite + Tailwind application inside the monorepo.

Main files:

- `apps/dashboard/src/App.tsx`
- `apps/dashboard/src/api.ts`
- `apps/dashboard/src/main.tsx`
- `apps/dashboard/src/styles.css`
- `apps/dashboard/vite.config.ts`
- `apps/dashboard/package.json`

The dashboard starts on the daily operation screen:

- `Hoy`
- `Menu de hoy`
- active/inactive menu items
- catalog management
- smart upload UI

### Dashboard API routes

Added `apps/api/src/routes/dashboard.ts` and registered it in `apps/api/src/index.ts`.

New local endpoints:

- `GET /dashboard/tenants`
- `GET /dashboard/:tenantSlug/diagnostics`
- `GET /dashboard/:tenantSlug/menu/today`
- `POST /dashboard/:tenantSlug/products`
- `PATCH /dashboard/:tenantSlug/products/:productId`
- `DELETE /dashboard/:tenantSlug/products/:productId`
- `POST /dashboard/:tenantSlug/uploads/product-image`
- `POST /dashboard/:tenantSlug/menu/today/items`
- `PATCH /dashboard/:tenantSlug/menu/today/items/:itemId`
- `DELETE /dashboard/:tenantSlug/menu/today/items/:itemId`

These routes use the existing tenant isolation model:

- `control.tenants`
- `tenant_<slug>.products`
- `tenant_<slug>.menus`
- `tenant_<slug>.menu_items`

### Supabase REST client

Extended `apps/api/src/lib/supabase-rest.ts`.

Added support for:

- `select`
- `insertReturning`
- `updateReturning`
- `delete`
- `uploadObject`

This is shared API infrastructure, but it does not alter chatbot routing or conversation behavior.

### Shared types

Added `packages/types/src/menu.ts`.

New shared types:

- `Product`
- `Location`
- `Menu`
- `MenuItem`
- `TodayMenuPayload`

Exported from `packages/types/src/index.ts`.

### Database migrations

Added migrations:

- `packages/db/migrations/0006_dashboard_product_images.sql`
- `packages/db/migrations/0007_test_tenants_arepas_pizza.sql`
- `packages/db/migrations/0008_product_images_bucket.sql`

Purpose:

- add `products.image_url`
- create demo tenants `arepas` and `pizza`
- create `product-images` storage bucket

Important: `tenant_arepas` and `tenant_pizza` must be applied and exposed in Supabase Project Settings -> API -> Exposed schemas before they appear in the dashboard.

### Local scripts

Added:

- `scripts/dev_services.py`
- `scripts/seed_demo_data.py`

`dev_services.py` manages local API/dashboard processes:

```bash
python scripts/dev_services.py --start
python scripts/dev_services.py --stop
python scripts/dev_services.py --restart
python scripts/dev_services.py --status
```

`seed_demo_data.py` seeds the demo tenant through Supabase REST using `apps/api/.dev.vars`.

### Documentation

Updated:

- `README.md`
- `apps/dashboard/README.md`
- `docs/integrations/supabase.md`
- `docs/schemas/database-v1.md`

### Git ignore

Updated `.gitignore` to keep local secrets and generated files out of git:

- `apps/api/.dev.vars`
- `apps/api/.wrangler/`
- `.dev-logs/`
- logs and build outputs

## Current known state

Supabase currently exposes and uses:

- `control`
- `tenant_demo`
- `tenant_arepas`
- `tenant_pizza`

The dashboard can list the demo tenants when the API is connected. `tenant_demo` is the operational WhatsApp tenant. `tenant_arepas` and `tenant_pizza` are demo catalog tenants.

The frontend currently focuses on menu/catalog/upload. The API client already includes functions for orders, alerts and automation, but the visual console for those modules is not implemented yet.

## Remaining required setup

The following older setup is already applied in the shared staging/Supabase environment. Repeat only for a new database:

- `0006_dashboard_product_images.sql`
- `0007_test_tenants_arepas_pizza.sql`
- `0008_product_images_bucket.sql`

Then expose these schemas in Supabase API settings:

- `tenant_arepas`
- `tenant_pizza`

After that, run:

```bash
python scripts/seed_demo_data.py
```

Next dashboard product work is tracked in:

- [dashboard-product-alignment-plan.md](/mnt/c/Users/samir/Documents/freelance/42day/docs/planning/dashboard-product-alignment-plan.md)
