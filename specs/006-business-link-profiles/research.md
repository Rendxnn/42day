# Investigación: perfiles ligeros de negocio

## Decisiones

- **Migración forward, no edición histórica.** La primera migración de perfiles ya está aplicada en
  staging; sus carencias se corrigen con una migración posterior idempotente. Así los entornos mantienen
  el mismo historial y el rollback de código no depende de reescribir una migración ejecutada.
- **Backend y RPCs para las mutaciones compuestas.** Un perfil de restaurante requiere actualizar el
  modelo canónico y columnas de una sede dentro de un schema tenant; deshabilitar requiere suspender y
  auditar varias unidades. Esas operaciones necesitan transacción en PostgreSQL y el Worker las invoca
  tras autorizar al actor.
- **`security invoker` y grants mínimos.** Las funciones operan con el rol del Worker y no quedan
  ejecutables para `anon` ni `authenticated`. La guía de Supabase recomienda privilegiar invoker y
  controlar grants/RLS conjuntamente.
- **Lectura pública por API controlada.** Aunque `control` tiene RLS forzado, el dashboard no expone sus
  tablas directamente. El endpoint público devuelve una proyección sin IDs internos, actores o enlaces
  deshabilitados.
- **Backfill insert-only.** Para cada tenant con sede activa se crea, si falta, un perfil ligado. No se
  modifican ni eliminan columnas legacy; las mutaciones posteriores mantienen ambas fuentes durante el
  rollout.

## Alternativas descartadas

- **Reusar solo columnas de `locations`:** no permite negocios sin tenant, visibilidad por enlace ni
  deshabilitación transaccional de QRs.
- **Dos escrituras REST desde el Worker:** puede dejar el perfil canónico y los campos legacy desalineados
  ante un fallo de red entre llamadas.
- **Permitir que el navegador construya `/p/:slug`:** permitiría asociaciones con slugs equivocados o
  perfiles no publicados; el backend debe derivar el destino autorizado.
- **Borrar perfiles al deshabilitarlos:** rompería QRs existentes, auditoría y rollback.

## Restricciones externas

- Las tablas creadas por migración requieren grants y RLS explícitos; RLS no sustituye grants.
- Los enlaces de Google Reviews conservan el flujo de preparación y confirmación existente porque su
  formato no es una API pública estable.
- No hay despliegue, migración ni configuración de producción en esta fase.
