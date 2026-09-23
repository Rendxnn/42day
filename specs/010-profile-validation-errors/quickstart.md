# Quickstart: validación comprensible de perfiles

## Objetivo

Verificar que un administrador pueda corregir perfiles y enlaces sin recibir identificadores técnicos.
El feature no agrega migraciones: reutiliza el contrato JSON de las rutas existentes.

## Límites visibles

Los límites son la fuente compartida `packages/types/src/business-profile-validation.ts`:

- Nombre: 160 caracteres.
- Titular: 180 caracteres.
- Sede: 160 caracteres.
- Dirección: 500 caracteres.
- Etiqueta de enlace: 120 caracteres.
- URL: 2.048 caracteres.
- Máximo de enlaces por perfil: 30.
- Teléfono/WhatsApp: entre 7 y 15 dígitos; se aceptan `+`, espacios, paréntesis, puntos y guiones.

Un enlace desactivado puede quedar sin URL. Un enlace activado debe tener URL válida; los destinos web
usan HTTPS y las reseñas de Google conservan el flujo de preparación y confirmación existente.

## Ejemplos de teléfono

Válidos: `+57 300 123 4567`, `+57 (300) 123-4567`, `300 123 4567`, `tel:+57-300-123-4567`.

Inválidos: `+57 300 123 4567 ext 9`, `300ABC123`, menos de 7 dígitos o más de 15 dígitos.
El backend no inventa el prefijo internacional: los dígitos se conservan y el administrador debe
introducir el país cuando sea necesario.

## Contrato de error

Las rutas de perfil devuelven:

```json
{
  "error": "business_profile_phone_invalid",
  "message": "El teléfono debe tener entre 7 y 15 dígitos y no debe incluir extensiones.",
  "field": "links[2].href"
}
```

El código es útil para telemetría y pruebas; el panel siempre muestra `message` o un fallback seguro y
no renderiza `business_profile_*`, `supabase`, `postgrest` ni cuerpos técnicos. Un error de red se
presenta como un problema de conexión con una instrucción para reintentar.

## Verificación local

```bash
./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit
./node_modules/.bin/tsc -p apps/dashboard/tsconfig.json --noEmit
cd apps/dashboard && ./node_modules/.bin/vite build
node --experimental-loader ./headless/resolve-loader.mjs --test --experimental-strip-types --experimental-specifier-resolution=node apps/api/test/business-profiles.test.mjs apps/api/test/dynamic-links-bulk-nfc.test.mjs
node --test apps/dashboard/test/*.test.mjs
```

Resultado de la implementación (2026-09-22): typecheck API/dashboard sin errores; suites focalizadas de
perfil/enlaces API 10/10, perfil/agente API 8/8 y dashboard 41/41; suite completa de API 261 pasadas,
17 omitidas preexistentes.

## Verificación manual

1. En **Perfiles de negocio** abre un perfil y supera cada límite visible; el campo debe mostrar el
   mensaje antes de enviar.
2. Guarda un teléfono con separadores, luego prueba una extensión; confirma que solo el segundo falla
   y que el mensaje explica cómo corregirlo.
3. Desactiva un enlace y elimina su URL; confirma que guardar no falla.
4. Simula una respuesta JSON sin `message`, una respuesta 500 y una caída de red; confirma que siempre
   aparece un texto accionable sin código interno.
El script `pnpm --filter @42day/dashboard build` no pudo cambiar al `pnpm@9.15.0` fijado porque el
registry local no pudo verificar la firma; el mismo build se ejecutó directamente con Vite y pasó.
