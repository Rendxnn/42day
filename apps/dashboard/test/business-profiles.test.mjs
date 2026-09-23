import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("profile editor exposes draft, publication, visibility and safe suspension actions", async () => {
  const [editor, section] = await Promise.all([
    readFile(new URL("../src/features/admin/BusinessProfileModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/features/admin/BusinessProfilesSection.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(section, /Buscar perfiles/);
  assert.match(section, /Siguiente/);
  assert.match(section, /Editar/);
  assert.match(section, /Deshabilitar/);
  assert.match(editor, /Publicar/);
  assert.match(editor, /Deshabilitar perfil/);
  assert.match(editor, /cambios sin guardar/);
  assert.match(editor, /enabled/);
  assert.match(editor, /revision/);
  assert.match(editor, /BUSINESS_PROFILE_LIMITS/);
  assert.match(editor, /aria-live/);
});

test("profile validation never renders technical error identifiers", async () => {
  const [modal, quickSetup, errors, api] = await Promise.all([
    readFile(new URL("../src/features/admin/BusinessProfileModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/features/admin/QuickDynamicLinkSetup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/features/admin/business-profile-errors.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/api.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(modal, /formatError\(/);
  assert.match(quickSetup, /formatBusinessProfileError/);
  assert.match(errors, /businessProfileErrorMessage/);
  assert.match(api, /backendMessage/);
  assert.match(quickSetup, /7 y 15/);
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
