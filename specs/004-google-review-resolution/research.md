# Investigación y decisiones

## Decisión: resolver redirecciones, no HTML

**Decision**: El Worker seguirá manualmente redirecciones permitidas y extraerá el identificador exclusivamente de URLs.

**Rationale**: Los enlaces públicos observados exponen un feature ID en la URL final; esto evita billing y scraping, mantiene bajo el alcance y permite controles SSRF deterministas.

**Alternatives considered**: Places API añade GCP/billing/credencial; scraping es frágil y contrario a las restricciones de Maps; el navegador no puede resolver short links de forma fiable por CORS.

## Decisión: verificación humana obligatoria

**Decision**: Todo resultado Google debe abrirse y confirmarse antes de habilitar el guardado.

**Rationale**: Una URL de dirección puede contener el mismo tipo de identificador que una ficha comercial. Sin Places API no existe verificación autoritativa del tipo de lugar.

**Alternatives considered**: El slug es solo orientativo; guardar inmediatamente permitiría una ficha equivocada.

## Decisión: persistir solo el destino final

**Decision**: No se almacenan la URL de origen, feature ID ni confirmación.

**Rationale**: La unidad existente ya guarda el único valor que necesita el redirector. Los demás son efímeros.

**Alternatives considered**: Una tabla o metadata de auditoría añadiría migración y retención sin caso operativo.

## Decisión: sin dependencia o caché nueva

**Decision**: Usar `URL`, `fetch` y `AbortController`; cada acción explícita resuelve una vez.

**Rationale**: El volumen es bajo, la ruta exige `system_admin` y los límites de red contienen costo y abuso.

**Alternatives considered**: KV, cache o rate limiting persistente agregan infraestructura; esto será obligatorio al abrir autoservicio.

## Decisión: adaptador reemplazable

**Decision**: La ruta consume un resolver aislado y devuelve un contrato independiente del mecanismo.

**Rationale**: El feature ID y `!12e1` son estructuras observadas, no un contrato público. Places API podrá reemplazar el adaptador sin cambiar React.

**Alternatives considered**: Implementarlo en la ruta mezclaría HTTP, seguridad, red y parsing.
