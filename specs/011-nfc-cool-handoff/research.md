# Investigación: handoff NFC.cool

## Decisión: NFC.cool + Atajos como proveedor activo

NFC.cool documenta una acción de Atajos llamada `Write NFC` que abre la escritura con una URL o texto precargado. Es el único candidato investigado que ofrece una interfaz documentada para recibir la URL desde una automatización de iOS. NFC Tools, NXP TagWriter y NFCore pueden escribir tags, pero no publican un contrato equivalente para precargar la URL desde ParaHoy.

**Razonamiento**: Permite conservar la entrega de una URL permanente desde el dashboard sin copiarla ni editarla manualmente en cada operación. El navegador sigue sin escribir NFC directamente.

**Alternativas descartadas**:

- NFC Helper: se conserva como legado, pero se deshabilita por el truncamiento observado durante escritura física.
- NFC Tools/NXP TagWriter/NFCore: fallback manual o herramienta de lectura, no adaptador de un clic desde ParaHoy.
- Aplicación iOS propia: tendría mejor control y callback, pero es un producto móvil nuevo fuera del alcance.

Fuentes: [NFC.cool para desarrolladores](https://nfc.cool/developers/), [NFC.cool compatibilidad](https://nfc.cool/).

## Decisión: usar el esquema de Atajos con entrada `text`

Apple documenta `shortcuts://run-shortcut?name=[name]&input=text&text=[text]`. El adaptador entrega la URL permanente como valor de `text`; `URLSearchParams` codifica una vez y la prueba lee el parámetro con `searchParams.get` para comprobar la igualdad exacta.

**Razonamiento**: El nombre y la carga útil quedan explícitos, no requieren incluir una URL final ni un token, y funcionan desde una página web hacia un Atajo previamente instalado.

**Alternativas descartadas**:

- Construir un enlace `nfcforiphone://`: NFC.cool documenta sus URL schemes para abrir scanners, no una escritura con URL precargada.
- Enviar la URL al portapapeles como única integración: se mantiene como fallback, pero no satisface la experiencia rápida.

Fuente: [Apple: ejecutar un atajo mediante esquema URL](https://support.apple.com/en-tm/guide/shortcuts/apd624386f42/ios).

## Decisión: no crear sesión ni callback para NFC.cool

NFC.cool documenta el prellenado mediante Atajos, pero no un callback de escritura equivalente a NFC Helper. Para evitar sesiones inútiles o hitos falsos, el endpoint nuevo no crea registros de handoff ni devuelve token/callback. La ruta de consumo existente se conserva exclusivamente para callbacks de NFC Helper emitidos antes de la transición.

**Razonamiento**: Una aplicación externa no es prueba de que el contenido se escribió completo y el chip sigue requiriendo lectura posterior.

## Decisión: NFC Helper conservado, no seleccionable

El constructor de URL NFC Helper queda encapsulado como adaptador legado. El selector activo devuelve NFC.cool de manera fija; no existe una variable remota capaz de reactivarlo accidentalmente. Reactivar Helper exigirá un cambio explícito y evidencia física nueva.

**Razonamiento**: El usuario pidió conservar la implementación sin dejar dos caminos indistinguibles o activar de nuevo el flujo defectuoso.

## Gate físico

Antes de certificar el proveedor se harán 20 ciclos de escritura y lectura en el iPhone objetivo con NTAG213: URL corta/larga dentro de la capacidad, chip nuevo, regrabable y bloqueado, cancelación y lectura en un segundo teléfono. Se comparará la URL leída byte a byte con la URL permanente emitida. Ninguna afirmación de éxito de esta matriz se hará sin evidencia fechada.
