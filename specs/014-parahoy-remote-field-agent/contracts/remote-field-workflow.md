# Contrato conversacional: visita de prospecto

Este documento es normativo para el skill incluido en ambos plugins.

## Inicio de cada visita

1. Llamar `parahoy_get_connected_account`.
2. Comparar `environment` con el ambiente escrito en el plugin y título de la tarea.
3. Informar en una línea: `Ambiente: STAGING/PRODUCCIÓN · Cuenta: <email> · sin cambios aún`.
4. Solicitar, si falta, al menos:
   - nombre/identificador del negocio y ubicación aproximada;
   - código QR impreso;
   - objetivo: crear o actualizar.
5. Repetir el código QR exactamente normalizado antes de usarlo.

Si falla cuenta/ambiente/autorización, detenerse. Nunca pedir contraseña, service role, API key o token al
usuario.

## Investigación

Prioridad de fuentes:

1. sitio oficial del negocio;
2. perfil social oficial entregado o enlazado por el sitio;
3. ficha Google/Maps que pueda confirmarse visualmente;
4. directorios públicos solo como indicio secundario.

Reglas:

- No eludir login, CAPTCHA, robots, paywall ni control de acceso.
- No asumir que la primera coincidencia con el mismo nombre es el negocio.
- Contradicciones de dirección, teléfono o cuenta social se muestran al usuario.
- Normalizar teléfono/WhatsApp solo mediante el backend; el agente conserva el candidato y país inferido como
  advertencia.
- Los links candidatos quedan activos solo si son oficiales/confirmados; un indicio puede incluirse desactivado
  o dejarse fuera.
- Google Reviews requiere pasar el candidato al resolver y abrir/confirmar el resultado.
- Elegir una imagen pública nítida del logo o fachada solo cuando la fuente es atribuible al negocio. Registrar
  fuente y preguntar si el operador confirma derecho de uso.
- Proponer una paleta legible inspirada en la marca; el backend decide contraste.

Una foto adjunta al chat puede usarse para leer contexto o sugerir colores, pero el skill debe decir que v1 no
puede importarla directamente. Para usarla, el operador la carga manualmente en dashboard o suministra una URL
HTTPS pública autorizada.

## Preparación de creación

1. Consultar QR exacto y perfiles parecidos.
2. Construir identidad, links, apariencia, avatar y evidencia.
3. Llamar `parahoy_prepare_business_setup` una sola vez por propuesta final.
4. Si el backend normaliza/omite un campo o devuelve advertencias, usar la salida del backend como verdad.
5. No ocultar coincidencias. Preguntar si crea nuevo o reutiliza una coincidencia.

## Preparación de actualización

1. Buscar/obtener el perfil exacto.
2. Usar patch mínimo: campos omitidos se conservan.
3. Enviar `links` solo si se revisó la lista completa, porque reemplaza el conjunto.
4. Elegir explícitamente avatar `keep`, `remove` o `import`.
5. Llamar `parahoy_prepare_business_profile_update`.

## Resumen obligatorio antes de confirmar

Mostrar un bloque compacto en este orden:

```text
Ambiente: STAGING | PRODUCCIÓN
Operación: crear y asignar | actualizar perfil
Negocio: <nombre>
Perfil: <nuevo slug o perfil actual>
QR: <código> · <estado> · <URL permanente>       # en setup
Destino actual → nuevo: <...>                     # si aplica
Datos: titular, ubicación, dirección
Links activos: tipo — destino legible
Apariencia: fondo, tarjeta, texto, icono, modo
Imagen: fuente sanitizada, alt text, derecho de uso pendiente/confirmado
Impacto: QR activo / N QRs activos consumen este perfil
Coincidencias: ninguna | lista y decisión requerida
Advertencias: todas
Fuentes: lista breve
Vence: hora local
```

Nunca mostrar `preparationToken`, hash, operation ID interno, access token ni URL de imagen con query.

## Confirmación

La pregunta final debe ser inequívoca y ser el último mensaje antes del tool commit:

```text
¿Confirmas aplicar exactamente esta propuesta en <AMBIENTE>, [crear/actualizar] el perfil
<NOMBRE> y [asignar el QR <CÓDIGO>]? También confirmas que tienes permiso para usar la imagen indicada.
```

Adaptaciones:

- Omitir frase de imagen si no hay importación.
- Para QR activo: añadir `Esto cambiará el destino público actual del QR activo sin cambiar su URL física.`
- Para perfil publicado: añadir `El cambio será visible inmediatamente en N QR(s) activo(s).`

Solo una respuesta afirmativa inequívoca al mensaje inmediatamente anterior autoriza commit. Preguntas,
correcciones, “espera”, respuestas ambiguas o más de diez minutos requieren volver a preparar. El agente genera
un UUID nuevo por operación lógica; en reintentos de red reutiliza el mismo.

## Resultado

Tras éxito, mostrar:

- ambiente;
- nombre y URL pública del perfil;
- QR y URL permanente si aplica;
- si fue replay idempotente;
- recordatorio: copiar/programar la URL permanente desde el dashboard, no el destino `/p/...`.

Abrir enlaces solo si el usuario lo pide. No marcar NFC programado/verificado/bloqueado.

## Errores y recuperación

| Situación | Acción del skill |
| --- | --- |
| `stale` | Obtener estado fresco, explicar diferencia y preparar otra vez. |
| Expirada | Preparar de nuevo; nunca intentar prolongar token. |
| Rate limit | Mostrar espera y no crear otro actor/cliente para evadirlo. |
| Import en progreso | Reintentar el mismo commit/operationId tras `Retry-After`. |
| Imagen rechazada | Proponer sin imagen o pedir otra fuente; no degradar validación. |
| OAuth revocado | Pedir reconectar el plugin; no solicitar tokens. |
| Mac/Remote caído | Usar dashboard móvil de staging/producción con login normal. |
| Investigación ambigua | Hacer una pregunta concreta o dejar el campo vacío. |

## Prohibiciones del skill

- No usar Supabase MCP, SQL, service role, consola de proveedor ni navegador autenticado como sustituto de las
  herramientas ParaHoy.
- No desplegar, migrar, cambiar secretos/DNS o modificar código durante una visita.
- No deshabilitar perfiles, archivar QRs, aplicar lotes ni registrar hitos NFC.
- No ejecutar producción porque el usuario dijo “sí” en otra operación o sesión.
- No ocultar el ambiente, coincidencias, advertencias, fuentes o impacto público.
