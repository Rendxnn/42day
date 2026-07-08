# Dashboard Frontend Structure

This note documents the current dashboard structure after the `Configuración` and payment-settings work, plus the collaboration rules that help keep future merges smaller and safer.

## Current Structure

The dashboard now follows this split:

- `apps/dashboard/src/App.tsx`
  - app shell only
  - session/auth bootstrap
  - tenant selection and top-level routing
  - high-level navigation
  - shared shell concerns like toasts, notifications, and view switching
- `apps/dashboard/src/orders.tsx`
  - full orders workspace
  - locale-aware order UI and operational actions
- `apps/dashboard/src/features/configuration/*`
  - restaurant `Configuración` feature
  - menu upload lives inside this feature now
  - payment accounts and QR settings live inside this feature
  - delivery coverage settings live inside this feature
  - feature-specific CRUD state stays here, not in `App.tsx`
- `apps/dashboard/src/api.ts`
  - frontend-to-backend request helpers
  - dashboard contracts used by the shell and feature containers
- `apps/dashboard/src/i18n.tsx`
  - dashboard locale provider
  - shared dashboard formatting helpers

## Shell Rules

`App.tsx` should remain the orchestration shell, not the place where a whole feature is built.

Keep in `App.tsx`:

- auth/session bootstrapping
- tenant loading
- deciding which top-level view is active
- wiring feature container props
- global notifications and shell-level warnings

Do not add to `App.tsx`:

- large feature forms
- CRUD panels for a specific module
- direct backend request logic inside leaf UI blocks
- legacy copies of a feature already extracted into `src/features/*`

## Feature Rules

When a screen becomes complex, create or extend a feature folder under `apps/dashboard/src/features/<feature-name>/`.

Feature containers should:

- own the feature-specific state
- call adapters or API helpers
- pass narrow props into presentational subcomponents

Leaf components should:

- focus on rendering and local interaction
- avoid `fetch` calls
- avoid depending on unrelated dashboard modules

## Configuration Feature Rules

For the restaurant settings area, the canonical structure is:

- top-level view id: `configuration`
- nav label: `Configuración`
- access: restaurant `encargado` only
- `Subida` is a section inside `Configuración`, not a top-level shell view
- delivery coverage is also a section inside `Configuración`, not a separate shell view
- payment settings live in `apps/dashboard/src/features/configuration/*`

Do not reintroduce:

- a top-level `upload` dashboard view
- a top-level `coverage` dashboard view
- text-based `transferPaymentInstructions`
- dashboard UX that depends on the removed legacy transfer-instructions flow

## API Integration Rules

For dashboard backend work:

- restaurant dashboard routes belong in `apps/api/src/features/dashboard/routes/*`
- the live dashboard router is `apps/api/src/features/dashboard/router.ts`
- `apps/api/src/routes/dashboard.ts` is compatibility-only

Do not add new live dashboard behavior to:

- `apps/api/src/routes/dashboard.ts`

If a new dashboard endpoint is needed:

1. add it in the modular dashboard route tree
2. keep backend domain logic out of the thin compatibility route file
3. expose frontend helpers in `apps/dashboard/src/api.ts`
4. wire the feature container to those helpers or to a feature adapter

## Locale Rules

Locale support is now part of the dashboard shell.

When adding new UI:

- prefer `useDashboardLocale()` in shell-level or feature-level containers
- use locale-aware helper functions for money and date formatting
- keep copy changes localized close to the screen that owns them

Do not remove locale props from components that already require them, especially:

- `OrdersView`
- shell/header/login/admin screens

## Merge-Safety Checklist

Before committing dashboard changes:

1. if the work is a full module, move it to `src/features/*`
2. if you touched `App.tsx`, confirm the change is shell-level and not feature-body logic
3. if you touched dashboard backend routes, confirm the change went into the modular dashboard router
4. verify you did not reintroduce legacy payment-instructions fields or the old `upload` view
5. verify migrations keep unique sequential filenames; do not reuse an existing migration number
6. run:

```bash
corepack pnpm --filter @42day/dashboard build
corepack pnpm --filter @42day/api build
```

## Recommended Team Convention

For future parallel work:

- one person can change shell/i18n/navigation
- another can change a feature folder
- another can change modular backend routes

That split is much safer than having multiple people edit the same giant file with unrelated concerns mixed together.
