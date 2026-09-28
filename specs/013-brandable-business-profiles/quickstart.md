# Quickstart: validar perfiles personalizables

## Prerrequisitos

- Feature 012 implementada.
- Supabase local iniciado y migraciones aplicadas.
- Usuario `system_admin`, un manager de tenant y un perfil genérico de prueba.
- Imágenes JPEG, PNG y WebP en límites; casos <64 px, >4096 px, >16 megapíxeles, SVG, MIME falso, truncado y
  archivos con EXIF/GPS/XMP/chunks textuales.

## Comandos

```bash
supabase --version
supabase migration up --local --yes
supabase db lint --local
pnpm --filter @42day/api test
pnpm --filter @42day/dashboard test
pnpm --filter @42day/api typecheck
pnpm --filter @42day/dashboard typecheck
pnpm --filter @42day/dashboard build
```

## Recorrido administrador

1. Crear un draft y confirmar los cuatro defaults y modo monocromo.
2. Cargar WebP válido, cambiar los cuatro colores y observar preview móvil.
3. Guardar una combinación con contraste bajo: draft guarda con advertencia.
4. Intentar publicar: debe rechazar con mensaje controlado.
5. Corregir contraste, publicar y abrir `/p/<slug>` a 320, 768 y 1440 px.
6. Alternar `brand` y `monochrome`; comprobar que logos oficiales no cambian de color.
7. Confirmar que cada enlace habilitado aparece una vez como tarjeta y los deshabilitados no están en el
   JSON público.
8. Forzar fallo de imagen y comprobar iniciales sin layout shift material.
9. Editar con revisión antigua y comprobar que no sobrescribe apariencia nueva.

## Seguridad de assets

1. Intentar JPEG/PNG/WebP válidos y archivos >3 MB, fuera de dimensiones/píxeles, SVG, MIME falso, truncado o
   con metadata prohibida.
2. Confirmar que `anon` y `authenticated` no listan ni descargan directamente el bucket.
3. Confirmar que el endpoint público devuelve 404 para un asset staged.
4. Asociar/publicar y comprobar 200, ETag, cache y `nosniff`.
5. Cambiar avatar y comprobar que el anterior no se borra si todavía tiene referencia.
6. Como manager creador, abrir el preview común; como otro tenant, recibir 404 sin detalle.
7. Ejecutar 31 cargas en una hora: la última devuelve 429/`Retry-After`; reiniciar el Worker no reinicia cupo.

## Manager

1. Editar el perfil vinculado mediante settings y abrir `/r/:tenantSlug` y `/p/:slug`.
2. Intentar otro tenant y un perfil genérico; ambos deben rechazarse sin filtrar detalle.

## Rendimiento y gates

- Medir p95 de lectura pública y asset cacheado con 10 000 perfiles en staging; objetivo <800 ms.
- Cronometrar cinco recorridos consecutivos de imagen+paleta+preview; cada uno debe terminar en menos de tres
  minutos sin salir del modal.
- Ejecutar raíz: `pnpm test`, `pnpm typecheck`, `pnpm build`.
- No aplicar staging ni producción sin autorización separada.

## Evidencia local — 2026-09-24

- `supabase migration up --local --yes`: aplicó `20260924142711_brandable_business_profiles.sql` sobre la
  instancia local existente (no se ejecutó reset ni se tocó remoto).
- `supabase db lint --local`: `No schema errors found`.
- `supabase/tests/brandable-business-profiles.sql`, `business-link-profiles.sql` y
  `dynamic-link-pagination.sql`: los tres ejecutaron `BEGIN / DO / ROLLBACK` correctamente. Se ajustó el test
  de paginación para comparar el conteo contra el baseline de la instancia en vez de asumir una base vacía.
- Esto no reemplaza una corrida desde DB limpia, la matriz completa de assets, la revisión independiente ni
  staging autorizado; los escenarios restantes están sin certificar.
