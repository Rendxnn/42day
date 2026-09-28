# Investigación: perfiles públicos personalizables

## Decisión: estructura fija con tokens acotados

**Decisión:** exponer cuatro colores, imagen y modo de iconos; derivar el resto del estilo.

**Razón:** permite identidad suficiente sin introducir CSS arbitrario, combinaciones imposibles ni un
constructor de páginas difícil de mantener.

**Alternativas descartadas:** plantillas múltiples, JSON de estilos libre, editor de bloques, color separado
para cada enlace.

## Decisión: dos modos de iconos

**Decisión:** `brand` usa recursos oficiales sin recolorear; `monochrome` usa pictogramas genéricos.

**Razón:** WhatsApp, Instagram y Google restringen modificación de sus logos. Separar identidad oficial de
pictogramas recoloreables evita incumplir esas reglas y conserva personalización.

**Fuentes:** guías de [WhatsApp](https://www.meta.com/en-gb/brand/resources/whatsapp/whatsapp-brand/),
[Instagram](https://www.meta.com/es-es/brand/resources/instagram/instagram-brand/) y
[Google](https://partnermarketinghub.withgoogle.com/brands/google/branding-guidelines/how-to-show-googles-brand/).

## Decisión: accesibilidad bloquea publicación

**Decisión:** guardar borradores inválidos con advertencia; bloquear publicación y cambios de un perfil ya
publicado si texto <4.5:1 o iconos monocromos <3:1.

**Razón:** el borrador debe permitir exploración, pero el estado público no puede degradarse. Corregir el
color automáticamente cambiaría una elección del usuario sin control.

## Decisión: bucket privado y proxy público por asset activo

**Decisión:** almacenar imágenes en un bucket privado y servirlas mediante un endpoint público que solo
resuelve assets activos.

**Razón:** un bucket público hace accesible cualquier objeto con su URL, incluso uno preparado y no aprobado.
El proxy conserva control de estado, headers y cache sin URLs firmadas persistentes.

**Alternativas descartadas:** bucket público con UUID no adivinable; URLs firmadas persistidas; bytes en DB.

## Decisión: RPC completas y compatibilidad de rollback

**Decisión:** añadir operaciones `create_business_profile_complete` y
`update_business_profile_complete`, manteniendo temporalmente las RPC actuales para código anterior.

**Razón:** apariencia, enlaces, revisión y asset deben cambiar de forma transaccional. Sobrecargar RPC con el
mismo nombre puede ser ambiguo para PostgREST; romper la firma actual impediría rollback de código.

**Condición de retiro:** eliminar wrappers anteriores solo en un feature posterior cuando API, MCP y fachada
de settings usen las operaciones completas en todos los ambientes.

## Decisión: sin dependencia de procesamiento de imágenes en servidor

**Decisión:** el dashboard intenta recodificar cargas manuales a WebP mediante canvas; el Worker valida firma,
estructura, tamaño, dimensiones de 64–4096 px por lado, máximo 16 megapíxeles y ausencia de EXIF/GPS/XMP/chunks
textuales antes de almacenar. No se añade una dependencia de imagen en esta feature.

**Razón:** recorridos estructurales acotados de JPEG/PNG/WebP permiten rechazar truncamiento, longitudes
inválidas y metadata sensible sin introducir un runtime/costo nuevo. No se promete validar semánticamente cada
bitstream comprimido; ante un fallo de decodificación residual, la página pública usa iniciales. Las
importaciones remotas de feature 014 reutilizarán exactamente esta frontera.
