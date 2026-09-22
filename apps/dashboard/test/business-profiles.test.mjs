import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("profile editor exposes draft, publication, visibility and safe suspension actions", async () => {
  const editor = await readFile(new URL("../src/features/admin/BusinessProfileEditor.tsx", import.meta.url), "utf8");
  assert.match(editor, /Crear borrador/);
  assert.match(editor, /Publicar/);
  assert.match(editor, /Deshabilitar y suspender QRs/);
  assert.match(editor, /enabled/);
  assert.match(editor, /revision/);
});

test("dashboard routes canonical public profiles and profile destinations through the API", async () => {
  const [app, inventory, api] = await Promise.all([
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/features/admin/DynamicLinksSection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/api.ts", import.meta.url), "utf8"),
  ]);
  assert.match(app, /PublicBusinessProfilePage/);
  assert.match(app, /startsWith\("\/p\/"\)/);
  assert.match(inventory, /Perfil publicado/);
  assert.match(inventory, /profileId/);
  assert.match(api, /getPublicBusinessProfile/);
});
