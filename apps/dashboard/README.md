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

## Features implementadas que hoy importan para demo

### Restaurante

- bandeja operativa de pedidos,
- estados pendientes, confirmados y cerrados,
- comprobantes de transferencia desde el detalle,
- confirmacion minima de pago,
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
- el frontend no tiene pruebas automatizadas.

## Deuda tecnica importante

### 1. Archivo principal demasiado grande

`src/App.tsx` concentra demasiada logica de producto, estado, admin, navegacion y comportamiento UI.

### 2. Modulo de pedidos tambien grande

`src/orders.tsx` concentra demasiada logica operativa en una sola pieza.

### 3. Cobertura automatizada ausente

Hoy `apps/dashboard` no tiene suite de tests configurada.

### 4. Bundle grande

El build actual compila, pero Vite ya advierte chunks grandes. No bloquea demos, pero si marca una deuda clara de mantenibilidad/performance.

## Principios vigentes

- el dashboard no debe fingir persistencia cuando el backend falla,
- el producto restaurante consume solo nuestro API,
- la revision humana sigue siendo parte del flujo para transferencia y casos `manual`,
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
