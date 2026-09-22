# Investigación

- **Decisión:** cursor keyset con valor de orden e `id`. **Motivo:** evita el coste y la inestabilidad de offset al crecer el inventario. **Alternativa descartada:** paginación por número de página, que requiere contar/desplazar filas.
- **Decisión:** RPC `security invoker` en `control` y grant exclusivo a service role. **Motivo:** el Worker ya autoriza system_admin y el dashboard no accede a Supabase directo.
- **Decisión:** protección visual, no bloqueo de backend. **Motivo:** la URL permanente permite reconfiguración segura y el bloqueo físico NFC es otro concepto.
