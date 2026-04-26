# Decisiones de negocio pendientes y recomendacion

## Direcciones y ubicacion

Recomendacion V1:

- aceptar direccion escrita como texto libre,
- aceptar ubicacion enviada por WhatsApp cuando el usuario la comparta,
- almacenar ambas formas,
- usar ubicacion WhatsApp como la forma mas confiable cuando exista,
- no bloquear el pedido si no se puede geocodificar automaticamente,
- permitir que el humano corrija o confirme direccion cuando haya duda.

Implicaciones tecnicas:

- direccion textual se guarda en `delivery_address`,
- ubicacion WhatsApp se guarda con `latitude`, `longitude` y payload raw en `customer_addresses`,
- una direccion puede quedar asociada al cliente para reutilizarla,
- si el usuario manda una ubicacion de WhatsApp, el backend ya puede normalizarla como mensaje tipo `location`,
- la validacion deterministica debe distinguir entre:
  - direccion presente,
  - ubicacion presente,
  - direccion ambigua,
  - fuera de cobertura.

## Horarios de atencion

Decision:

- todo horario operativo debe ser configurable desde dashboard,
- el backend solo interpreta y aplica la configuracion.

Recomendacion V1:

- guardar horarios por sede en `locations.opening_hours`,
- formato JSON por dia de semana,
- permitir pausas/cierres manuales despues.

Ejemplo conceptual:

```json
{
  "monday": [{ "opens": "11:00", "closes": "15:00" }],
  "tuesday": [{ "opens": "11:00", "closes": "15:00" }]
}
```

## Cobertura y Google Maps

Buscar coincidencias en Google Maps significa geocodificar una direccion textual:

```txt
"Cra 15 # 80-20, Bogota"
-> Google Maps Geocoding API
-> lat/lng normalizado
```

Medir distancia maxima implica comparar la ubicacion del cliente contra la sede:

```txt
distancia(sede, cliente) <= radio_maximo
```

Implicaciones:

- requiere API key de Google Maps,
- tiene costo por uso,
- puede devolver coincidencias ambiguas,
- necesita manejar errores de geocoding,
- requiere guardar lat/lng de sede y cliente,
- permite reglas de cobertura mas claras.

Recomendacion V1:

- empezar con direccion texto + ubicacion WhatsApp,
- dejar `coverage_config` listo,
- no depender de Google Maps para confirmar pedidos en la primera version,
- agregar Google Maps cuando el flujo basico ya este estable.

Decision actual:

- se evaluara primero cobertura por radio,
- si la operacion real lo requiere, luego se puede extender a barrios.

Comparacion practica:

- cobertura por radio:
  - se configura un punto de sede con `latitude` y `longitude`,
  - se define un radio maximo en kilometros,
  - si el cliente manda ubicacion, se calcula distancia automaticamente,
  - es mas facil de automatizar,
  - falla si el negocio tiene cobertura irregular por zonas.
- cobertura por barrios:
  - se mantiene una lista manual de barrios permitidos,
  - funciona mejor cuando el restaurante conoce bien su mapa real de entrega,
  - depende de que la direccion venga bien escrita,
  - requiere mas validacion humana y limpieza de texto.

Recomendacion concreta:

- V1.1: radio cuando el cliente mande ubicacion WhatsApp,
- fallback manual cuando solo mande texto,
- V2: combinar radio + lista de barrios especiales/excluidos.

## Delivery y pickup

Decision:

- pickup no cobra domicilio,
- delivery puede cobrar domicilio fijo,
- delivery puede desactivarse por sede,
- pickup puede desactivarse por sede,
- todo esto se configura en dashboard.

Campos preparados:

- `locations.delivery_enabled`
- `locations.pickup_enabled`
- `locations.delivery_fee_fixed`

Regla backend:

```txt
if fulfillment_type = pickup -> delivery_fee = 0
if fulfillment_type = delivery and delivery_enabled -> delivery_fee = locations.delivery_fee_fixed
if delivery disabled -> no ofrecer domicilio
if pickup disabled -> no ofrecer pickup
```

## Pausa de automatizacion

Recomendacion V1:

- permitir pausar automatizacion por restaurante desde `control.tenants.automation_enabled`,
- permitir pausar automatizacion por sede desde `locations.automation_enabled`,
- cuando se pausa, el webhook sigue recibiendo y guardando mensajes,
- cuando se pausa, el bot no responde automaticamente y debe quedar alerta para humano.

Esto evita perder mensajes mientras el restaurante esta saturado o quiere operar manualmente.

## Pedidos fuera de horario

Decision:

- si el restaurante esta fuera de horario, el sistema puede aceptar el pedido como preorden,
- esto debe quedar explicado en la conversacion.

Mensaje esperado en la idea de flujo:

```txt
Actualmente no estamos en servicio.
Si quieres, podemos anotar tu pedido para una hora especifica.
```

Implicacion operativa:

- el draft puede seguir armando pedido,
- antes de confirmar se debe pedir la hora objetivo,
- la orden final debe quedar marcada como programada o con nota visible.

## Intentos de aclaracion

Decision:

- maximo 2 intentos de aclaracion automatica,
- en el tercer bloqueo o ambiguedad, pasar a humano.

Implicacion tecnica:

- la conversacion debe guardar un contador de aclaraciones activas,
- al superar 2 se crea alerta y se mueve a estado `manual`.

## Dashboard y acceso a datos

Decision:

- el dashboard debe consumir solo nuestro API por ahora,
- no se planea acceso directo desde frontend a Supabase en esta etapa.

Motivo:

- evita depender de policies RLS complejas demasiado pronto,
- concentra la logica del negocio en backend,
- facilita auditoria, validacion y cambios de contrato.

## Lo que sigue siendo decision real

- si Google Maps entra en V1 o V2,
- si promociones aplican automaticas o son items seleccionables.
