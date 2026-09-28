import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../plugins/", import.meta.url);
const environments = [
  { suffix: "staging", name: "parahoy-prospectos-staging", server: "parahoy-staging", host: "42day-api-staging.42day.workers.dev", label: "STAGING" },
  { suffix: "production", name: "parahoy-prospectos-production", server: "parahoy-production", host: "42day-api-production.42day.workers.dev", label: "PRODUCCIÓN" },
];

test("private Parahoy plugins are environment-separated and contain no credentials", () => {
  const docs = [];
  for (const environment of environments) {
    const directory = new URL(`${environment.name}/`, root);
    const manifest = JSON.parse(readFileSync(new URL(".codex-plugin/plugin.json", directory), "utf8"));
    const mcp = JSON.parse(readFileSync(new URL(".mcp.json", directory), "utf8"));
    const skill = readFileSync(new URL("skills/create-or-update-prospect-profile/SKILL.md", directory), "utf8");
    const confirmation = readFileSync(new URL("skills/create-or-update-prospect-profile/references/confirmation-template.md", directory), "utf8");
    const policy = readFileSync(new URL("skills/create-or-update-prospect-profile/references/source-policy.md", directory), "utf8");
    assert.equal(manifest.name, environment.name);
    assert.match(manifest.interface.displayName, new RegExp(environment.label));
    assert.deepEqual(Object.keys(mcp.mcpServers), [environment.server]);
    assert.equal(mcp.mcpServers[environment.server].url, `https://${environment.host}/mcp`);
    assert.match(skill, new RegExp(environment.label));
    assert.match(skill, /ambiente/i);
    for (const text of [skill, confirmation, policy]) {
      assert.match(text, /confirm(?:aci[oó]n|ar|ada)/i);
      assert.doesNotMatch(text, /SUPABASE_SERVICE_ROLE_KEY|Bearer [A-Za-z0-9._-]{20,}|refresh_token/i);
    }
    assert.match(skill, /no.*(?:contrase[nñ]as|tokens|service role)/i);
    docs.push(skill.replaceAll(environment.label, "<ENV>").replaceAll(environment.server, "<SERVER>"));
  }
  assert.notEqual(environments[0].host, environments[1].host);
  for (const forbidden of ["Supabase MCP", "SQL", "despliegues", "no registres hitos NFC"])
    assert.ok(docs.every((doc) => doc.toLowerCase().includes(forbidden.toLowerCase())));
});
