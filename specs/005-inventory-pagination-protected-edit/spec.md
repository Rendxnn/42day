# Especificación: inventario paginado y edición protegida

**Feature**: `005-inventory-pagination-protected-edit`  
**Creado**: 2026-09-21  
**Estado**: aprobado para implementación

## Escenarios y pruebas

### US1 — Encontrar inventario completo (P1)

Como `system_admin`, quiero buscar, filtrar, ordenar y recorrer el inventario de enlaces físicos sin que la interfaz dependa de una ventana de 200 unidades.

**Prueba independiente:** con más de 250 unidades, buscar una fuera de la primera ventana y navegar siguiente/anterior sin duplicados ni omisiones.

1. Dado un inventario grande, cuando cambio filtros, orden o tamaño, entonces obtengo una nueva primera página de 25, 50 o 100 resultados y el total filtrado.
2. Dado que estoy en páginas posteriores, cuando navego atrás, entonces veo el cursor previamente observado; no hay salto arbitrario de página.
3. Dado un código exacto fuera de la página, cuando lo consulto, entonces la unidad encontrada entra o refresca correctamente el estado mostrado.

### US2 — Proteger una unidad activa (P1)

Como `system_admin`, quiero que una unidad activa sea claramente protegida contra cambios accidentales, sin volverla inmutable.

**Prueba independiente:** abrir una unidad activa, verificar lectura, entrar explícitamente a editar, cambiar el destino y confirmar el cambio actual→nuevo.

1. Dado un enlace activo, cuando lo veo, entonces aparecen estado activo/protegido, enlace permanente y campos de solo lectura.
2. Cuando selecciono `Editar configuración`, el sistema obtiene de nuevo la unidad y crea el borrador con esa revisión fresca.
3. Cuando cambio destino, perfil o negocio, entonces debo confirmar el impacto público; cambiar solo etiqueta no requiere esa confirmación.
4. Cuando otra sesión modifica la unidad, entonces un conflicto de revisión no rehidrata ni guarda automáticamente y ofrece recargar.
5. `NFC bloqueado físicamente` solo se muestra con `nfcLockedAt`; registrar ese hito advierte que el dashboard no bloquea el chip ni puede revertirlo.

## Requisitos

- **FR-001:** el inventario acepta `query`, `status`, `tenantId`, `batchId`, `sort`, `direction`, `pageSize` y cursor opaco ligado a la consulta.
- **FR-002:** la respuesta contiene unidades, `totalCount`, `hasNext` y `nextCursor` cuando aplica.
- **FR-003:** búsqueda incluye código, etiqueta y sede sin interpolar valores de cliente en SQL.
- **FR-004:** orden permitido: `updatedAt`, `createdAt`, `code`, `label`, `status`; el desempate estable es `id`.
- **FR-005:** CSV honra filtros del servidor y no se presenta como descarga limitada a la página.
- **FR-006:** los contratos Dynamic Link compartidos viven en `@42day/types`.
- **FR-007:** una activa inicia protegida en lectura y una edición se basa en una nueva lectura exacta.
- **FR-008:** archivada sigue terminal; ningún estado visual NFC cambia su semántica.

## Casos límite

- Cursor inválido, sort, dirección o tamaño inválidos devuelven un error controlado.
- La concurrencia entre páginas puede cambiar el conjunto siguiente; el cursor conserva orden y no duplica la frontera.
- Un código encontrado exacto no elimina unidades que ya están en la página.

## Fuera de alcance

- Perfiles ligeros, configuración por lote y NFC Helper: features 006–008.
- Cambio de URL permanente, analítica de visitantes, despliegue o cambios de producción.

## Criterios de éxito

- Un administrador encuentra una de más de 250 unidades con un único filtro y sin cargar todas en navegador.
- Navegación, filtros y estados protegidos son utilizables con teclado y a 320 px.
- Las mutaciones conservan revisión optimista y auditoría existente.
