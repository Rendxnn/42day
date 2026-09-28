import assert from "node:assert/strict";
import test from "node:test";
import { validateBusinessProfileImage } from "../src/features/public-profile/business-profile-image.ts";
import { parseAppearance } from "../src/features/public-profile/business-profile-validation.ts";

function png(width = 64, height = 64, extraChunk = "") {
  const header = Uint8Array.from([137,80,78,71,13,10,26,10, 0,0,0,13, 73,72,68,82, 0,0,0,width, 0,0,0,height, 8,6,0,0,0, 0,0,0,0]);
  const end = Uint8Array.from([0,0,0,0, 73,69,78,68, 0,0,0,0]);
  if (!extraChunk) return concat(header, end);
  return concat(header, Uint8Array.from([0,0,0,1, ...new TextEncoder().encode(extraChunk), 0]), end);
}
function concat(...parts) { const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; } return out; }

test("validates PNG dimensions and type from file bytes, not filename", () => {
  assert.deepEqual(validateBusinessProfileImage(png()), { contentType: "image/png", extension: "png", width: 64, height: 64 });
  assert.throws(() => validateBusinessProfileImage(png(4096, 4096)), /business_profile_avatar_dimensions_invalid/);
});

test("rejects image metadata chunks and malformed headers", () => {
  assert.throws(() => validateBusinessProfileImage(png(64, 64, "eXIf")), /business_profile_avatar_metadata_unsupported/);
  assert.throws(() => validateBusinessProfileImage(new Uint8Array([1, 2, 3])), /business_profile_avatar_type_invalid/);
});

test("rejects files above the 3 MiB cap", () => {
  assert.throws(() => validateBusinessProfileImage(new Uint8Array(3 * 1024 * 1024 + 1)), /business_profile_avatar_size_invalid/);
});

test("normalizes profile color values and rejects invalid palette syntax", () => {
  const appearance = parseAppearance({ backgroundColor: "#f3e9df", cardColor: "#ffffff", textColor: "#261d18", iconColor: "#6d4d3c", iconMode: "brand" });
  assert.equal(appearance.backgroundColor, "#F3E9DF");
  assert.throws(() => parseAppearance({ backgroundColor: "red", cardColor: "#ffffff", textColor: "#000000", iconColor: "#000000", iconMode: "brand" }), (error) => error.code === "business_profile_appearance_invalid");
});
