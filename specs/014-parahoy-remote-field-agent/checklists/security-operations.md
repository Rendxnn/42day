# Checklist independiente de seguridad y operación

**Revisor**: una persona distinta del implementador.
**Regla**: estos ítems permanecen abiertos hasta revisar código, configuración y evidencia real.

## Identidad y OAuth

- [ ] CHK001 Protected Resource Metadata referencia el issuer Supabase correcto del mismo ambiente.
- [ ] CHK002 No queda metadata de authorization server sintetizada por el Worker.
- [ ] CHK003 Consentimiento muestra cliente, ambiente, scopes y capacidades antes de aprobar/denegar.
- [ ] CHK004 Login preserva `authorization_id` sin open redirect ni persistencia/logs indebidos.
- [ ] CHK005 JWT verifica firma, kid/alg, issuer, audience, exp/nbf, subject y client_id exacto.
- [ ] CHK006 `system_admin` se consulta en servidor y perder el rol revoca capacidad efectiva.
- [ ] CHK007 DCR está deshabilitado después del bootstrap y no quedan clientes desconocidos.
- [ ] CHK008 Revocar grant y retirar allowlist detienen invocaciones sin afectar dashboard.

## Herramientas y confirmación

- [ ] CHK009 Prepare no produce cambios públicos ni descarga imágenes.
- [ ] CHK010 El resumen muestra ambiente, fuentes, warnings, diff, impacto, coincidencias y vencimiento.
- [ ] CHK011 La confirmación es inmediatamente anterior y cualquier corrección obliga a preparar otra vez.
- [ ] CHK012 QR activo, perfil publicado e imagen exigen cada consentimiento aplicable.
- [ ] CHK013 Replay no duplica entidad, asset activo ni auditoría; payload distinto falla.
- [ ] CHK014 Ninguna tool permite SQL, deploy, delete/disable, bulk o hitos NFC.

## Imagen/SSRF

- [ ] CHK015 Cada salto DNS/redirect bloquea rangos internos IPv4/IPv6 y userinfo/puertos no permitidos.
- [ ] CHK016 Límite temporal/tamaño se aplica durante streaming, antes de consumir todo el body.
- [ ] CHK017 Firma/decodificación contradice MIME falso y SVG nunca se acepta.
- [ ] CHK018 La URL completa, query, resolución IP, bytes y lease ID no aparecen en logs/auditoría.
- [ ] CHK019 Solo un asset se activa bajo concurrencia y un fallo deja como máximo un staged privado.

## Remote y ambientes

- [ ] CHK020 Plugin staging y production tienen IDs, nombres, MCP, OAuth clients y tareas distintos.
- [ ] CHK021 La tarea de campo no necesita repo, Supabase MCP, service role ni credenciales pegadas.
- [ ] CHK022 El iPhone verifica ambiente/cuenta y el dictado no provoca un commit sin revisión textual.
- [ ] CHK023 Caída de Mac/Remote/OAuth usa dashboard como fallback sin degradar autorización.
- [ ] CHK024 Producción no fue modificada durante implementación/certificación staging.

## Evidencia

- [ ] CHK025 Pruebas unitarias, API, Supabase local, frontend y plugin están verdes.
- [ ] CHK026 Los 20 recorridos Remote de staging terminaron sin duplicados/cambios parciales.
- [ ] CHK027 Rate limits y errores controlados se validaron con concurrencia realista.
- [ ] CHK028 Documentación durable y runbook coinciden con código/configuración desplegada.
