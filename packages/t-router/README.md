# t-router

Paquete vendorizado temporalmente dentro del monorepo de 42day.

Objetivo:

- usar el router de IA sin depender todavia de publicacion externa,
- mantener el nombre `@rendxnn/t-router` para que luego el cambio a npm sea simple,
- evitar problemas de instalacion de dependencias Git en Windows.

Cuando se publique externamente, el cambio esperado es volver a cambiar el
specifier en consumidores de:

```json
"@rendxnn/t-router": "workspace:*"
```

a una version o tag publicado.
