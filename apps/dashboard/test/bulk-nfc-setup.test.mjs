import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard expone configuración masiva con preflight y consentimiento de activos", async () => {
  const source = await readFile(new URL("../src/features/admin/BulkDynamicLinkSetup.tsx", import.meta.url), "utf8");
  assert.match(source, /preflightDynamicLinkBulkConfiguration/);
  assert.match(source, /consentedActiveUnitIds/);
  assert.match(source, /Aplicar todo-o-nada/);
  assert.match(source, /units.length >= 100/);
});

test("configuración rápida ofrece perfil ligero y NFC Helper con fallback manual", async () => {
  const source = await readFile(new URL("../src/features/admin/QuickDynamicLinkSetup.tsx", import.meta.url), "utf8");
  assert.match(source, /Crear perfil rápido/);
  assert.match(source, /Escribir con NFC Helper/);
  assert.match(source, /Copiar enlace para NFC/);
  assert.match(source, /verificación y el bloqueo físico/);
});
