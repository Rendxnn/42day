# Dashboard

Aplicacion web de 42day para operar restaurantes y, en el mismo frontend, la consola admin de la plataforma.

## Estado real hoy

El dashboard ya cubre una parte importante del flujo `demo-ready`:

- login con Supabase Auth,
- resolucion de tenants permitidos via API,
- vista operativa de pedidos,
- detalle de pedido,
- aceptar pedido,
- marcar agotados y proponer reemplazos,
- reintentar notificacion al cliente,
- mover estados operativos basicos,
- revisar comprobante de transferencia,
- confirmar pago cuando la orden esta en `payment_pending_review`,
- modulo `Configuración` para encargados,
- subida de menu movida al modulo `Configuración`,
- configuracion de cobertura de domicilios movida al modulo `Configuración`,
- CRUD de cuentas bancarias por sede,
- CRUD de QR de pago por sede,
- activacion/desactivacion con reglas de maximo 5 cuentas activas y 1 QR activo,
- warning global cuando la sede no tiene ningun metodo de transferencia activo,
- CRUD de productos,
- productos compuestos/configurables,
- menu del dia,
- upload y asociacion de imagenes de producto,
- toggle de automatizacion,
- notificaciones basicas por pedidos nuevos,
- consola admin para overview, restaurantes y miembros.

No es todavia una consola humana completa para conversaciones manuales.

## Contrato actual

El frontend consume solo `apps/api`. No accede directo a tablas operativas desde UI para menu, pedidos, alertas o cambios de estado.

Flujo de auth:

1. el usuario inicia sesion con Supabase Auth,
2. el frontend obtiene el `access_token`,
3. el token viaja como `Bearer` al backend,
4. el backend valida el usuario y resuelve tenants/roles,
5. toda operacion sensible pasa por `apps/api`.

Para configuracion de pagos, el frontend ya consume endpoints reales del backend. Ya no usa instrucciones de transferencia en texto libre ni un adapter mock para la operacion normal.

## Features implementadas que hoy importan para demo

### Restaurante

- bandeja operativa de pedidos,
- estados pendientes, confirmados y cerrados,
- comprobantes de transferencia desde el detalle,
- confirmacion minima de pago,
- configuracion de pagos por sede,
- configuracion de cobertura de domicilios por sede,
- CRUD de cuentas con banco, numero y titular,
- CRUD de QR con imagen persistida y preview,
- validaciones visuales para activacion, desactivacion y eliminacion,
- agotados con reemplazos,
- polling y notificaciones de pedidos nuevos,
- soporte de realtime para refresco de ordenes,
- gestion de menu del dia y catalogo.

### Plataforma admin

- overview admin basico,
- crear restaurante,
- editar tenant y sede,
- crear miembros,
- resetear password,
- inactivar restaurantes y miembros.

## Gaps reales actuales

- no existe todavia una vista dedicada de `Alertas`,
- no existe timeline de conversacion para casos `manual`,
- no existe flujo visual completo para retomar una conversacion manual especifica,
- no existe rechazo formal de comprobante con pedido de reenvio,
- no existe testing automatizado del modulo `Configuración`,
- el frontend no tiene pruebas automatizadas.

## Deuda tecnica importante

### 1. Archivo principal todavia grande

`src/App.tsx` ya esta mejor que al inicio de la sesion porque `Configuración`, cobertura de domicilios y su logica de pagos viven en `src/features/configuration/*`, pero sigue concentrando bastante shell, navegacion, estado global y flujos admin.

### 2. Modulo de pedidos sigue siendo grande

`src/orders.tsx` concentra demasiada logica operativa en una sola pieza.

### 3. Cobertura automatizada ausente

Hoy `apps/dashboard` no tiene suite de tests configurada.

### 4. Dependencia en backend y migraciones

El modulo de configuracion de pagos ya depende de tablas, storage bucket y endpoints reales. La parte funcional del frontend esta lista, pero el proceso de aplicar migraciones Supabase y estandarizar ese workflow en el repo sigue siendo una tarea pendiente de infraestructura.

### 5. Bundle grande

El build actual compila, pero Vite ya advierte chunks grandes. No bloquea demos, pero si marca una deuda clara de mantenibilidad/performance.

## Principios vigentes

- el dashboard no debe fingir persistencia cuando el backend falla,
- el producto restaurante consume solo nuestro API,
- la revision humana sigue siendo parte del flujo para transferencia y casos `manual`,
- la configuracion de pagos ya no usa `transferPaymentInstructions`,
- el objetivo inmediato es una operacion creible para demo, no una consola total de atencion humana.

## Variables necesarias

Frontend:

```txt
VITE_API_BASE_URL
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Backend relacionado:

```txt
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DASHBOARD_ALLOWED_ORIGINS
GEMINI_API_KEY
```

## Desarrollo local

```bash
corepack pnpm --filter @42day/dashboard dev
corepack pnpm --filter @42day/dashboard build
```

Para una sesion real tambien necesitas el API:

```bash
corepack pnpm --filter @42day/api dev
```

Tambien puedes usar el helper del repo:

```bash
python scripts/dev_services.py --start
```

## Estructura recomendada

La guia viva para mantener la separacion entre shell, features e integracion backend esta en [docs/architecture/dashboard-frontend.md](/Users/rendxnn/Documents/freelance/42day/docs/architecture/dashboard-frontend.md:1).
