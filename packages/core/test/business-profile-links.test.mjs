import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBusinessProfileLink, normalizeBusinessProfilePhone, slugifyBusinessProfile } from "../src/business-profile-links.ts";

test("business profile links normalize slugs and contact URLs", () => {
  assert.equal(slugifyBusinessProfile("Café & Pan"), "cafe-pan");
  assert.equal(normalizeBusinessProfilePhone("+57 (300) 123-4567"), "573001234567");
  assert.equal(normalizeBusinessProfileLink("phone", "+57 300 123 4567"), "tel:+573001234567");
  assert.equal(normalizeBusinessProfileLink("whatsapp", "https://wa.me/573001234567"), "https://wa.me/573001234567");
  assert.throws(() => normalizeBusinessProfileLink("website", "http://example.com"), /business_profile_link_href_invalid/);
});
