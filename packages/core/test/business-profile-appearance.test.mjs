import assert from "node:assert/strict";
import test from "node:test";
import { businessProfileAppearanceIsPublishable, businessProfileInitials, contrastRatio, normalizeHexColor, validateBusinessProfileAppearance } from "../src/business-profile-appearance.ts";

test("normalizes colors and computes WCAG contrast", () => {
  assert.equal(normalizeHexColor("#abcdef"), "#ABCDEF");
  assert.equal(contrastRatio("#000000", "#FFFFFF"), 21);
  assert.ok(contrastRatio("#767676", "#FFFFFF") >= 4.5);
  assert.ok(contrastRatio("#777777", "#FFFFFF") < 4.5);
  assert.ok(contrastRatio("#949494", "#FFFFFF") >= 3);
  assert.ok(contrastRatio("#959595", "#FFFFFF") < 3);
  assert.equal(businessProfileInitials("Élan 茶店"), "É茶");
  assert.equal(businessProfileInitials("  "), "?");
});

test("accepts readable palettes and rejects low contrast only at publish gate", () => {
  const appearance = { backgroundColor: "#fffaf4", cardColor: "#FFFFFF", textColor: "#261D18", iconColor: "#FFFFFF", iconMode: "monochrome" };
  const validated = validateBusinessProfileAppearance(appearance);
  assert.equal(validated.appearance.backgroundColor, "#FFFAF4");
  assert.equal(businessProfileAppearanceIsPublishable(appearance), false);
  assert.equal(businessProfileAppearanceIsPublishable({ ...appearance, iconColor: "#000000" }), true);
  assert.throws(() => validateBusinessProfileAppearance({ ...appearance, textColor: "#xyzxyz" }), /business_profile_appearance_invalid/);
});
