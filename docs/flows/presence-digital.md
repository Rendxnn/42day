# ParaHoy Presencia Digital

## Experiencia estándar deseada

Una landing responsive basada inicialmente en una plantilla fija:

- logo, portada y colores principales;
- presentación del restaurante;
- horarios, ubicación, contacto y redes;
- llamados a ver la carta, escribir por WhatsApp, llamar, abrir Maps o responder la encuesta;
- carta del día con disponibilidad;
- concierge IA sobre productos y conocimiento autorizado.

El estándar incluye una URL de ParaHoy o dominio propio. Una página avanzada con diseño o secciones a medida se cotiza como extensión personalizada.

## Estado actual

### Actual

- Ruta pública de perfil por slug.
- Perfil canónico ligero `/p/:profileSlug` para negocios genéricos y restaurantes migrados.
- Enlaces de WhatsApp, teléfono, redes, web, Maps y encuesta.
- En la iteración local de 2026-09-24, paleta de cuatro colores, modo de iconos brand/monochrome,
  carga de avatar privada JPEG/PNG/WebP y componente de tarjeta compartido con el preview.
- Carta pública conectada al menú operativo.
- Concierge IA con historial acotado y conocimiento del restaurante.
- Configuración de perfil y carga/edición de conocimiento desde dashboard.

### Parcial

- El perfil es principalmente un hub de enlaces, no la landing completa.
- La apariencia está parcialmente implementada localmente; faltan SVG oficiales con registro de procedencia,
  integración equivalente en settings de manager, pruebas DB y revisión independiente de UX/seguridad.
  No hay analítica pública ni carrito multi-producto.
- La identidad visual, información y autogestión no cubren todos los campos objetivo.
- El modo `standalone`/`connected` depende de `automation_enabled`; esto mezcla producto contratado y operación.

### Deseado

- Personalización acotada de la tarjeta pública: foto/logo, fondo plano, fondo de tarjeta, texto, modo/color
  de iconos y activos oficiales de WhatsApp, Instagram y Google. No incluye layout libre, CSS ni SVG subidos.
- Branding y contenido estándar completos.
- Horarios y dominio administrables.
- Autogestión de identidad, información, enlaces, catálogo, carta, disponibilidad y conocimiento.
- Carrito web con varias líneas que se transfiere a WhatsApp.
- Rate limiting, cuota y presupuesto controlado para el concierge público.

## Concierge

El concierge explica, compara y recomienda elementos de la carta usando únicamente datos del menú y conocimiento aprobado. No confirma pedidos, no altera el carrito, no inventa disponibilidad y no sustituye ParaHoy Pedidos.

Una respuesta que no pueda sostenerse con el contexto debe reconocer el límite y dirigir al restaurante o a WhatsApp. La exposición pública requiere protección contra abuso antes de escalar.

## Paquete completo

Cuando el tenant tiene ambos módulos, carta y WhatsApp comparten catálogo y disponibilidad. El carrito deseado contiene múltiples productos, cantidades y configuraciones suficientes para iniciar el contexto en WhatsApp; la confirmación, validación y pago continúan en ParaHoy Pedidos.

No se documenta como checkout web y no se infiere del estado de `automation_enabled`. Los entitlements técnicos independientes son trabajo pendiente.
