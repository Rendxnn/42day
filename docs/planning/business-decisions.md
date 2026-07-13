# Scope congelado demo-ready

## Objetivo

Congelar un alcance creible para demos y pruebas controladas con restaurantes, sin abrir trabajo de produccion que hoy no es necesario para validar el producto.

## En scope

### Conversacion

- saludo y menu del dia real,
- seleccion por numero, nombre o alias,
- pedido natural simple con fallback LLM,
- multiples items simples en una misma frase,
- edicion basica del draft: agregar, quitar, reemplazar, ajustar cantidad,
- delivery y pickup,
- direccion por texto o ubicacion de WhatsApp,
- pago en efectivo o transferencia,
- confirmacion del cliente,
- handoff a humano.

### Operacion restaurante

- orden pendiente de confirmacion del restaurante,
- aceptacion desde dashboard,
- agotados con reemplazos sugeridos,
- notificacion al cliente por WhatsApp,
- avance manual del estado operativo,
- toggle de automatizacion.

### Catalogo

- CRUD de productos,
- productos compuestos/configurables en catalogo,
- menu del dia,
- carga de imagen de producto,
- analisis de imagen de menu como apoyo interno.

### Administracion

- provisionamiento de restaurantes,
- gestion de miembros,
- activacion/inactivacion operativa,
- overview admin basico.

## Fuera de scope para este tramo

- OCR/menu ingestion listo para produccion,
- reconciliacion automatica de pagos,
- cobertura geoespacial fuerte,
- horarios operativos completos en flujo,
- inventario,
- promociones complejas,
- POS,
- multi-idioma,
- analytics avanzados,
- voz/audio.

## Decisiones cerradas

### Tenancy y operacion

- una sola sede por restaurante en este tramo,
- dashboard consume solo nuestro API,
- tenant isolation por schema `tenant_<slug>` mas schema global `control`,
- onboarding de restaurantes via consola admin interna.

### Pedido y checkout

- pickup y delivery desde V1,
- delivery usa fee fijo por sede,
- direccion minima valida: texto libre o ubicacion de WhatsApp,
- todos los pedidos requieren confirmacion final del cliente,
- toda orden creada queda pendiente de confirmacion del restaurante.

### Transferencia

- la transferencia se pide solo despues de que el restaurante acepta disponibilidad,
- la validacion del pago es humana,
- el comprobante debe terminar relacionado a mensaje y orden,
- el comprobante hoy ya queda persistido y relacionado a mensaje y orden,
- despues de recibir comprobante, el caso pasa a handoff y queda en revision humana minima.

### IA

- proveedor inicial: Gemini,
- el LLM solo extrae estructura,
- nunca calcula precios,
- nunca decide disponibilidad,
- nunca confirma ordenes,
- el backend siempre valida y decide.

### Handoff

- maximo 2 aclaraciones automaticas antes de pasar a humano,
- `manual` corta auto-respuesta,
- las alertas humanas son parte del producto demo-ready, no una deuda opcional.

### Dashboard

- modulo de pedidos es parte del flujo principal,
- agotados y reemplazos deben poder demostrarse,
- notificacion visual/sonora por pedidos nuevos es suficiente para demos,
- falta consola completa de alertas/conversacion, pero ya es un gap identificado y acotado.

## Lo que consideramos aceptable para demos

- matcher de productos fuerte para items simples,
- interpretacion deterministica estricta seguida de fallback semantico obligatorio para todo texto no resuelto,
- validacion deterministica de configurables para productos bien modelados en catalogo,
- retries manuales de notificacion,
- algunas rutas operativas dependientes de pasos internos de configuracion.

## Lo que no deberiamos prometer todavia

- que cualquier configurable quedara perfectamente validado,
- que la revision humana de transferencia ya esta completamente cerrada en UX,
- que el dashboard ya es consola humana completa,
- que la automatizacion apagada siempre genera trabajo visible sin huecos,
- que el producto esta listo para operacion de alta escala o cero supervision.
