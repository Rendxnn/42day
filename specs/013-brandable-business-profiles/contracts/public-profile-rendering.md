# Contrato visual: perfil público personalizable

## Estructura fija

1. Página con `pageBackgroundColor` y contenido centrado.
2. Tarjeta principal, máximo 560 px, `cardBackgroundColor`, radio y sombra fijos.
3. Avatar circular de 112 px; en 320 px puede reducirse hasta 96 px.
4. Nombre, titular, ubicación y dirección con `textColor`.
5. Lista de una columna; cada enlace habilitado aparece una vez como tarjeta táctil mínima de 48 px.
6. Pie de ParaHoy dentro de la tarjeta, sin competir con el negocio.

No existe fila superior de iconos sociales.

## Iconografía

| Modo | WhatsApp/Instagram/Google | Otros tipos |
| --- | --- | --- |
| `brand` | asset oficial sin recolor sobre placa neutral | pictograma genérico con `textColor` |
| `monochrome` | pictograma genérico con `iconColor` | pictograma genérico con `iconColor` |

`google_review` usa el recurso Google autorizado en modo marca y una estrella genérica en monocromo.
`custom` nunca intenta inferir una marca desde la URL.

## Estados

- Avatar cargando: reserva el círculo para evitar salto.
- Avatar fallido/ausente: iniciales y `aria-label` con el nombre.
- Sin enlaces: identidad visible y mensaje neutro; no se inventa CTA.
- Link focus: outline visible de al menos 2 px.
- Texto largo: wrap; no truncar información esencial.
- `prefers-reduced-motion`: sin transiciones decorativas no esenciales.

## Contraste

- `textColor` contra `cardBackgroundColor`: >= 4.5.
- `iconColor` contra `cardBackgroundColor`: >= 3.0 en monocromo.
- Logos oficiales se colocan sobre placa neutral aprobada; no se recolorean para forzar contraste.
