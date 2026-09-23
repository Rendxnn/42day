# Smoke tests de ParaHoy

## Preparación

Registra fecha, ambiente, commit, tenant y módulos que se validarán. Usa placeholders en documentación y conserva IDs reales solo en el sistema operativo correspondiente.

Verifica salud:

```bash
curl -fsS <api-base-url>/health
```

La respuesta debe incluir `ok: true`, el servicio técnico y el ambiente esperado.

## ParaHoy Pedidos

1. Envía un saludo o solicitud de menú por WhatsApp.
2. Realiza un pedido natural con más de un producto y al menos un configurable.
3. Selecciona domicilio o recogida; para domicilio prueba ubicación o dirección escrita y cobertura.
4. Completa billing y elige efectivo o transferencia.
5. Confirma el resumen y comprueba creación de la orden una sola vez.
6. Desde dashboard revisa transcripción, totales, dirección, billing y medio de pago.
7. Acepta la orden o marca un agotado; valida reemplazo y notificación.
8. Actualiza progreso de cocina y confirma notificación correspondiente.
9. Pausa y reanuda la conversación; durante la pausa no debe responder automáticamente.

Para transferencia, adjunta imagen o PDF, confirma almacenamiento privado y revisión manual. No esperes conciliación automática.

En el flujo actual, todo texto automatizable intenta el plan IA estructurado; las validaciones de estado,
catálogo y permisos siguen siendo backend. Si Gemini o el fallback no están disponibles, verifica la
aclaración/fallback segura y que no se produzca mutación parcial.

## ParaHoy Presencia Digital

Comprueba endpoints públicos sin sesión:

```bash
curl -fsS <api-base-url>/dashboard/public/<tenant-slug>/profile
curl -fsS <api-base-url>/dashboard/public/<tenant-slug>/carta
curl -fsS -X POST <api-base-url>/dashboard/public/<tenant-slug>/carta/concierge \
  -H 'content-type: application/json' \
  -d '{"question":"¿Qué me recomiendas?","history":[]}'
```

Después verifica en navegador:

- perfil, enlaces y CTA;
- carta y disponibilidad;
- recomendaciones del concierge basadas en productos reales;
- respuesta segura cuando el conocimiento no alcanza;
- encuesta habilitada solo cuando existe URL;
- responsive y estados 404 de tenant/perfil inactivo.

No certifiques todavía landing completa, dominio propio, carrito multi-producto, autogestión integral ni rate limiting: son capacidades pendientes.

## Paquete completo

- Confirma que carta y WhatsApp leen el mismo catálogo y disponibilidad.
- Cambia disponibilidad desde dashboard y verifica ambos canales.
- No uses `automation_enabled` como evidencia del módulo contratado.
- Hasta implementar carrito, valida solo enlaces de continuidad a WhatsApp, no transferencia de múltiples líneas.

## Enlaces QR/NFC: configuración rápida móvil

Con una cuenta administradora y una unidad de prueba no archivada:

1. Abre **Inventario físico → Configuración rápida** desde un teléfono de 320 px de ancho.
2. Lee un QR impreso de ParaHoy. Confirma que no se abre su destino durante la lectura y que aparece el código correcto.
3. Repite denegando permiso de cámara y pegando `https://go.thaledon.com/r/<código>`; un QR o URL externos deben rechazarse sin navegar.
4. Configura etiqueta y una URL HTTPS; deja el negocio sin asignar y usa **Guardar y activar**. Confirma que la unidad queda activa.
5. Copia el enlace para NFC, comprueba que coincide exactamente con el URL mostrado y con el QR, y prográmalo/verifícalo mediante el flujo operativo NFC separado.
6. En una unidad activa modifica el destino y confirma que la pantalla muestra destino actual y nuevo antes de guardar.
7. Cierra el flujo, cambia de pestaña y completa una lectura en pruebas separadas; la luz/indicador de cámara debe apagarse en cada caso.
8. Repite en Safari de iPhone y Chrome de Android. Registra fecha, dispositivo, permiso, resultado de copia y al menos 20 lecturas físicas por plataforma antes de imprimir en producción.
9. Con más de 250 unidades de prueba, busca una que no esté en la primera página; cambia orden y tamaño 25/50/100 y navega Anterior/Siguiente. Confirma que CSV filtrado contiene todo el resultado y que `SVG + CSV página` solo representa la página visible.
10. Abre una unidad activa: debe empezar protegida en lectura. Selecciona **Editar configuración**, verifica que vuelve a consultar la revisión y confirma un cambio de destino actual→nuevo. Registra el bloqueo físico solo después de confirmar que el chip realmente fue bloqueado; ese hito no equivale a verificación NFC.
11. Selecciona **Configurar varios**, agrega entre 2 y 100 códigos sin duplicarlos y ejecuta el preflight. Los activos deben aparecer protegidos, las unidades archivadas excluidas y cualquier exclusión obliga a corregir la selección antes de aplicar.
12. Confirma individualmente los activos y aplica un perfil o redirección. Repite el mismo `operationId` desde una prueba API y verifica que no duplica auditoría; cambia una revisión y comprueba que el lote completo se revierte.
13. En un iPhone con NFC.cool Tools, crea una sola vez el Atajo llamado exactamente **Escribir NFC ParaHoy**. Debe recibir texto y entregarlo a la acción `Write NFC` de NFC.cool como URL.
14. Desde una unidad activa elige **Escribir con NFC.cool**. Atajos debe recibir únicamente la URL permanente; cancelar, fallar o volver al dashboard no modifica UID, `NFC programado`, `NFC verificado` ni `Bloqueado`. El fallback de copiar URL sigue disponible si NFC.cool o el Atajo no están instalados.
15. Antes de certificar NFC.cool, completa 20 escrituras/lecturas físicas con NTAG213 en el iPhone objetivo. En cada ciclo compara byte a byte la URL NDEF leída con la URL permanente del dashboard; incluye chips nuevos, regrabables, preescritos y bloqueados.

### Perfil ligero de negocio

1. En administración global crea un perfil con nombre, titular y enlaces de Instagram, web y WhatsApp; deja
   Instagram desactivado y confirma que el borrador devuelve 404 en `/p/<slug>`.
2. Guarda, publica y abre la URL canónica. Solo los enlaces activados deben aparecer; la URL `/r/<tenantSlug>`
   de un restaurante migrado debe conservar su resultado compatible.
3. Edita una configuración publicada con una revisión vieja y confirma `business_profile_stale` sin reintento
   automático. Consulta el perfil y verifica el conteo de QRs activos antes de deshabilitarlo.
4. Con QRs activos usa exclusivamente **Deshabilitar y suspender**; confirma suspensión total, auditoría por
   unidad y conservación de cada URL permanente.
5. En el editor de perfil prueba teléfono y WhatsApp con `+57 300 123 4567`, `300 123 4567` y un valor con
   letras/extensión. Los dos primeros deben guardar; el último debe explicar el formato esperado sin mostrar
   `business_profile_phone_invalid`. Activa/desactiva un enlace y confirma que uno desactivado sin URL no bloquea.
6. Introduce valores que superen los límites visibles de nombre, titular, dirección y URL. El formulario debe
   bloquear el envío, anunciar el error y mostrar el campo afectado; un fallo de red o JSON inesperado debe
   mostrar una explicación genérica accionable, nunca el código o el body técnico.

### Inventario de perfiles y agente móvil

1. En **Perfiles de negocio** busca por nombre, slug, sede y dirección; cambia estado, asociación, orden,
   dirección y tamaño. Confirma que Anterior/Siguiente conserva filtros, no duplica filas y mantiene el total.
2. Abre una fila en **Editar** y modifica un enlace. Verifica que el modal obtiene el detalle vigente, advierte
   al cerrar con cambios, y que una revisión obsoleta muestra el conflicto sin sobrescribir la versión remota.
3. Usa **Eliminar** solo en el sentido documentado de **Deshabilitar perfil**; confirma el impacto de QRs activos
   y que el perfil sigue localizable bajo el filtro Deshabilitado.
4. Comprueba los metadatos `/.well-known/oauth-protected-resource` y registra un cliente móvil de staging con
   un JWT válido de un `system_admin`. Sin exponer tokens en logs, llama `tools/list` a `POST /mcp` y verifica las
   cinco herramientas esperadas.
5. Desde la conversación móvil llama `parahoy_prepare_business_setup` con un código exacto y enlaces públicos.
   Revisa coincidencias, advertencias, revisión y cambio actual→propuesto; confirma que todavía no se asignó el QR.
6. Tras confirmar explícitamente, llama `parahoy_commit_business_setup` con `operationId`. Comprueba perfil
   publicado, asociación, auditoría y URL permanente; repite el mismo comando y verifica `replayed: true` sin
   duplicados. Usa una propuesta vencida o una revisión cambiada y confirma que toda la operación se rechaza.

## Seguridad y aislamiento

- Un miembro solo accede a tenants autorizados.
- Un slug o ID de otro tenant no expone datos privados.
- Las llamadas públicas no incluyen conocimiento interno, billing, conversaciones ni comprobantes.
- La clave pública no obtiene filas fuera de RLS; la service role no aparece en frontend.
- Schemas nuevos tienen exposición, grants, RLS y Realtime verificados explícitamente.

## Automatización local

```bash
pnpm --filter @42day/api test
pnpm --filter @42day/dashboard test
pnpm typecheck
pnpm --filter @42day/dashboard build
```

Estos comandos no sustituyen las pruebas externas de Meta, Supabase, hosting y proveedores IA.

## Flujo headless local

Con Supabase local saludable y un tenant seed registrado:

```bash
printf '%s\n' '{"version":1,"command":"start","tenant":"headless-demo"}' | pnpm --silent --filter @42day/api headless
printf '%s\n' '{"version":1,"command":"turn","tenant":"headless-demo","sessionId":"<hss-id>","turnId":"turn-001","text":"Quiero ver el menú"}' | pnpm --silent --filter @42day/api headless
printf '%s\n' '{"version":1,"command":"inspect","tenant":"headless-demo","sessionId":"<hss-id>"}' | pnpm --silent --filter @42day/api headless
printf '%s\n' '{"version":1,"command":"close","tenant":"headless-demo","sessionId":"<hss-id>"}' | pnpm --silent --filter @42day/api headless
```

Verifica que las respuestas tengan `delivery=captured`, que no exista `provider_message_id` de Meta y
que el envelope incluya `routing.ai.provider/model`, IDs opacos de efectos y snapshots agregados sin
PII, sin exponer teléfono, dirección, billing, prompts ni raw de IA. Para una ejecución
indeterminada no repitas `turn`: inspecciona y usa `reconcile` con la observación autorizada. La
integración real contra Supabase local y el recorrido de ocho turnos deben registrarse como evidencia
fechada; si el stack no está iniciado, el check queda bloqueado. El E2E sin dobles fijos está
implementado y fue verificado con ocho turnos reales usando `gemini-flash-lite-latest`; la configuración
dedicada puede volver a `gemini-2.5-flash` cuando su cuota esté disponible.

Para ejecutar las pruebas que usan el stack local y Gemini real de forma explícita:

```bash
HEADLESS_SUPABASE_INTEGRATION=1 node --test --experimental-strip-types --experimental-specifier-resolution=node apps/api/test/headless-chat-manifest-integration.test.mjs apps/api/test/headless-chat-fault-injection.test.mjs
HEADLESS_REAL_E2E=1 node --test --experimental-strip-types --experimental-specifier-resolution=node apps/api/test/headless-chat-real-e2e.test.mjs
```

La segunda prueba crea un pedido de validación en el tenant local configurado; no se ejecuta dentro de
la suite por defecto para evitar llamadas accidentales al proveedor y datos de prueba no solicitados.
Los tests deterministas usan únicamente dobles inline y no deben convertirse en una ruta operativa.

### Paridad y fallos headless

La matriz real de 15 escenarios se ejecuta con:

```bash
CI=true HEADLESS_SUPABASE_INTEGRATION=1 pnpm --filter @42day/api test:headless:integration
```

Compara el mismo resultado de negocio para WhatsApp fake y headless desde el límite normalizado; la
única diferencia esperada es `sent` frente a `captured`. La matriz de fallos cubre checkpoint,
outbound, draft, conversación y orden. Un fallo antes o después de cualquiera de esas fronteras deja
el turno `indeterminate`; no se reintenta automáticamente. `inspect` observa y `reconcile` consulta la
evidencia autoritativa sin ejecutar IA, catálogo, geocodificación, Meta ni otro efecto.

Para resetear el entorno solo local, primero ejecuta el check seguro y después la confirmación explícita:

```bash
scripts/bash/reset-local-headless-chat.sh --check
scripts/bash/reset-local-headless-chat.sh --reset --confirm local-headless-reset
```

El helper rechaza endpoints remotos y archiva el journal; nunca borra un directorio amplio ni elimina
datos silenciosamente.
