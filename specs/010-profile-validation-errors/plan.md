# Plan de implementación: Validación comprensible de perfiles

**Feature**: `010-profile-validation-errors` | **Rama**: `staging` | **Fecha**: 2026-09-22

## Resumen

Corregir la frontera de validación compartida del perfil ligero y las tres superficies que la consumen.
El servidor seguirá siendo autoritativo: normaliza formatos aceptados, devuelve un contrato de error
seguro y no permite que el cliente desactive validaciones de seguridad. El dashboard mostrará copy
accionable y límites junto a cada campo.

## Decisiones técnicas

1. Los límites de producto vivirán en `@42day/types` para evitar que API y UI diverjan.
2. La normalización de teléfono se mantendrá en `@42day/core`, aceptará separadores y prefijos de
   transporte conocidos, y rechazará letras/extensiones explícitas. No asumirá un país ni inventará
   un prefijo.
3. `BusinessProfileValidationError` tendrá código estable, campo opcional y mensaje seguro derivado
   del catálogo compartido. Las rutas responderán `{ error, message, field? }`.
4. La configuración rápida filtrará plantillas desactivadas antes de normalizarlas; cualquier enlace
   activado seguirá pasando por `normalizeLink` y por las reglas de host/HTTPS existentes.
5. `DashboardApiError` conservará `backendError`, pero también leerá `message` y `field`; una función
   de presentación única traducirá códigos conocidos y usará fallback seguro.
6. El MCP devolverá la misma separación `{ error, message }` en `structuredContent` y texto, sin exponer
   detalles de proveedores.

## Límites canónicos

| Campo | Regla | Copy esperado |
|---|---:|---|
| Nombre | 1–160 caracteres | Nombre visible del negocio |
| Titular | hasta 180 | Descripción corta |
| Sede | hasta 160 | Ciudad o sede |
| Dirección | hasta 500 | Dirección pública |
| Slug | hasta 80, minúsculas | Se fija al publicar |
| Etiqueta de enlace | hasta 120 | Texto del botón |
| URL | 1–2048, HTTPS | Sin usuario, contraseña ni hosts locales |
| Enlaces | máximo 30 | Solo activados se validan |
| Teléfono/WhatsApp | 7–15 dígitos | Separadores normales; sin letras ni extensiones |

## Archivos y responsabilidades

```text
[MODIFY] packages/types/src/business-profile-validation.ts
[MODIFY] packages/types/src/index.ts
[MODIFY] packages/core/src/business-profile-links.ts
[MODIFY] apps/api/src/features/public-profile/business-profile-validation.ts
[MODIFY] apps/api/src/features/public-profile/business-profile-routes.ts
[MODIFY] apps/api/src/features/dynamic-links/admin-routes.ts
[MODIFY] apps/api/src/features/business-setup-agent/mcp-routes.ts
[MODIFY] apps/api/src/features/business-setup-agent/service.ts
[MODIFY] apps/dashboard/src/api.ts
[MODIFY] apps/dashboard/src/features/admin/BusinessProfileModal.tsx
[MODIFY] apps/dashboard/src/features/admin/BusinessProfilesSection.tsx
[MODIFY] apps/dashboard/src/features/admin/QuickDynamicLinkSetup.tsx
[MODIFY] apps/api/test/business-profiles.test.mjs
[MODIFY] apps/api/test/business-setup-agent.test.mjs
[MODIFY] apps/dashboard/test/business-profiles.test.mjs
[ADD]    apps/dashboard/src/features/admin/business-profile-errors.ts
[ADD]    specs/010-profile-validation-errors/quickstart.md
```

## Contrato de error

```ts
type BusinessProfileError = {
  error: string;
  message: string;
  field?: string;
};
```

El servidor solo emitirá códigos de dominio conocidos o `business_profile_invalid`; los mensajes no
incluirán el body de Supabase. Errores de red, HTML o cuerpos no JSON se convierten en “No se pudo
completar la operación. Revisa los datos e inténtalo de nuevo.” en el dashboard.

## Flujo de validación

```text
input no confiable
  -> límites compartidos
  -> normalización pura (teléfono/URL)
  -> reglas por tipo de enlace
  -> error {code, field, safe message} o payload válido
  -> API/dashboard/MCP presentan la misma intención
```

## Seguridad, compatibilidad y rollout

- No se toca Supabase ni se crean migraciones: los cambios son de validación y presentación, y los
  datos existentes se conservan.
- Se mantiene HTTPS, allowlist de hosts, preparación de Google Reviews y autoridad del backend.
- Se validan cambios en staging después de las pruebas focalizadas; producción queda fuera de este
  alcance.
- Rollback: revertir código y despliegue; no hay cambios irreversibles de datos.

## Matriz requisito-prueba

| Requisito | Evidencia |
|---|---|
| FR-001–FR-003 | tests de normalización y parser de perfil/API |
| FR-004–FR-006 | tests de rutas, MCP, `DashboardApiError` y copy |
| FR-007 | pruebas estructurales + revisión manual de formulario |
| FR-008 | regresiones de URLs inseguras y Google Reviews |
| NFR-001–NFR-003 | aserciones de payload seguro, aria-live y typecheck |
