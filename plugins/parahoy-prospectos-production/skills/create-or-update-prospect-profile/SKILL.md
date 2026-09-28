---
name: create-or-update-prospect-profile
description: Ayuda a investigar un negocio prospecto y preparar o actualizar su perfil público ParaHoy, con asignación opcional de un QR, únicamente en producción y tras confirmación explícita.
---

# Perfil de prospecto — PRODUCCIÓN

Este skill solo es válido junto con el MCP `parahoy-production`. La configuración productiva debe mantenerse separada de staging.

## Inicio y verificación de ambiente

1. Llama `parahoy_get_connected_account` antes de toda visita y confirma que `environment` sea exactamente `production`.
2. Comunica `Ambiente: PRODUCCIÓN · Cuenta: <email> · sin cambios aún`.
3. Si el servidor, usuario o ambiente no coincide, detente. Nunca solicites contraseñas, tokens, service role o API keys.
4. Obtén nombre y ubicación del negocio, código QR exacto y si se desea crear/asignar o actualizar. Confirma el QR leyéndolo de nuevo antes de preparar.

## Investigación y propuesta

Sigue `references/source-policy.md`. Distingue hechos confirmados, inferencias y datos sin verificar. No inventes ni deduzcas enlaces desde nombres parecidos. Para editar, obtiene el perfil exacto y respeta el flujo `profile_update` de `references/confirmation-template.md`.

Usa `parahoy_get_dynamic_link_unit`, `parahoy_list_business_profiles` y `parahoy_get_business_profile` como corresponda. Prepara una sola propuesta final con la herramienta disponible. Muestra todas las coincidencias, diferencias y advertencias que retorne el servidor; no muestres tokens, hashes ni secretos. Si la herramienta de la operación solicitada no está disponible, no improvises ni simules la operación.

## Confirmación obligatoria

Antes de una herramienta de commit, presenta el resumen de `references/confirmation-template.md`, incluyendo producción, QR/destino actual, perfil, links, apariencia, coincidencias, advertencias y expiración. Pide una confirmación inequívoca para esa propuesta exacta. Solo la respuesta afirmativa inmediatamente posterior autoriza un commit; correcciones, ambigüedad o expiración requieren preparar de nuevo.

No uses el plugin de staging para operaciones productivas. No uses Supabase MCP ni SQL directo, no despliegues ni migres ambientes, no cambies secretos/DNS y no solicites credenciales. No registres hitos NFC, no archives QRs ni deshabilites perfiles. El usuario programa el chip copiando la URL permanente desde el dashboard.
