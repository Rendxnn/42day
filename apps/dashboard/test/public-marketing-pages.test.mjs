import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolvePublicMarketingPage } from "../src/marketing/marketingRoutes.ts";

const appPath = new URL("../src/App.tsx", import.meta.url);
const landingPath = new URL("../src/LandingPage.tsx", import.meta.url);
const footerPath = new URL("../src/marketing/MarketingFooter.tsx", import.meta.url);
const identityPath = new URL("../src/marketing/legalIdentity.ts", import.meta.url);
const publicPagesPath = new URL("../src/marketing/PublicInformationPage.tsx", import.meta.url);

test("resuelve las páginas públicas y acepta slash final", () => {
  assert.equal(resolvePublicMarketingPage("/"), "landing");
  assert.equal(resolvePublicMarketingPage("/acerca-de-nosotros"), "about");
  assert.equal(resolvePublicMarketingPage("/politica-de-privacidad/"), "privacy");
  assert.equal(resolvePublicMarketingPage("/terminos-y-condiciones"), "terms");
  assert.equal(resolvePublicMarketingPage("/login"), null);
  assert.equal(resolvePublicMarketingPage("/carta/demo"), null);
});

test("las páginas públicas se resuelven antes del dashboard", async () => {
  const app = await readFile(appPath, "utf8");

  assert.match(app, /resolvePublicMarketingPage\(window\.location\.pathname\)/);
  assert.match(app, /marketingPage === "landing"/);
  assert.match(app, /<PublicInformationPage page=\{marketingPage\}/);
});

test("el footer usa enlaces funcionales de producto, empresa y legal", async () => {
  const [landing, footer] = await Promise.all([
    readFile(landingPath, "utf8"),
    readFile(footerPath, "utf8"),
  ]);

  assert.match(landing, /<MarketingFooter locale=\{locale\}/);
  assert.match(footer, /href: "\/#como-funciona"/);
  assert.match(footer, /href: "\/acerca-de-nosotros"/);
  assert.match(footer, /href: "\/politica-de-privacidad"/);
  assert.match(footer, /href: "\/terminos-y-condiciones"/);
  assert.match(footer, /<nav aria-label=\{title\}>/);
  assert.match(footer, /<a className="transition hover:text-\[var\(--wa-green-dark\)\]" href=\{item\.href\}>/);
});

test("las páginas identifican a Samuel y reflejan el tratamiento real de ParaHoy", async () => {
  const [identity, publicPages] = await Promise.all([
    readFile(identityPath, "utf8"),
    readFile(publicPagesPath, "utf8"),
  ]);

  assert.match(identity, /Samuel Rendón Trujillo/);
  assert.match(identity, /1039446020-5/);
  assert.match(identity, /3012648763/);
  assert.match(identity, /Calle 58 sur #42-99/);
  assert.match(identity, /thaledoncolombia@gmail\.com/);
  assert.match(identity, /Google Gemini/);
  assert.match(publicPages, /Supabase/);
  assert.match(publicPages, /Meta Platforms/);
  assert.match(publicPages, /responsable.*encargado/s);
  assert.doesNotMatch(publicPages, /pendiente de confirmación antes de publicación/);
});

test("cada página pública configura título, descripción y canonical", async () => {
  const publicPages = await readFile(publicPagesPath, "utf8");

  assert.match(publicPages, /Política de privacidad \| ParaHoy/);
  assert.match(publicPages, /Términos y condiciones \| ParaHoy/);
  assert.match(publicPages, /Acerca de nosotros \| ParaHoy/);
  assert.match(publicPages, /pathname: "\/politica-de-privacidad"/);
  assert.match(publicPages, /pathname: "\/terminos-y-condiciones"/);
  assert.match(publicPages, /pathname: "\/acerca-de-nosotros"/);
});
