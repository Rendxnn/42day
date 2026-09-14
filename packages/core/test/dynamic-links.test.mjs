import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGoogleReviewUrl,
  classifyGoogleReviewUrl,
  extractGoogleMapsFeatureId,
} from "../src/dynamic-links.ts";

test("classifies Google Maps share, business and direct review URLs", () => {
  assert.equal(classifyGoogleReviewUrl("https://maps.app.goo.gl/abc").kind, "maps_short_link");
  assert.equal(classifyGoogleReviewUrl("https://goo.gl/maps/abc").kind, "maps_short_link");
  assert.equal(classifyGoogleReviewUrl("https://g.page/example").kind, "maps_short_link");
  assert.equal(
    classifyGoogleReviewUrl("https://www.google.com/maps/place/Cafe/data=!4m6!1s0x123:0xabc!8m2").kind,
    "maps_business_url",
  );
  assert.equal(
    classifyGoogleReviewUrl("https://maps.google.com/?q=Example&ftid=0x123:0xabc&entry=gps").kind,
    "maps_business_url",
  );
  assert.equal(
    classifyGoogleReviewUrl("https://www.google.com/maps/place//data=!4m3!3m2!1s0x123:0xabc!12e1").kind,
    "direct_review_url",
  );
  assert.equal(classifyGoogleReviewUrl("https://g.page/example/review").kind, "direct_review_url");
  assert.equal(
    classifyGoogleReviewUrl("https://search.google.com/local/writereview?placeid=ChIJ123").kind,
    "direct_review_url",
  );
});

test("rejects unsafe and unsupported Google-like inputs", () => {
  for (const value of [
    "http://maps.app.goo.gl/abc",
    "https://user:pass@maps.app.goo.gl/abc",
    "https://maps.app.goo.gl:444/abc",
    "https://maps.app.goo.gl.evil.example/abc",
    "https://maps.google.com.evil.example/?ftid=0x123:0xabc",
    "https://127.0.0.1/maps",
    "https://www.google.com/search?q=cafe",
    "https://maps.google.com/?q=Example",
    "https://maps.google.com/?q=Example&ftid=not-a-feature-id",
    "x".repeat(2_049),
  ]) {
    assert.equal(classifyGoogleReviewUrl(value).kind, "unsupported", value);
  }
});

test("extracts one normalized feature id from ftid or data tokens", () => {
  assert.deepEqual(
    extractGoogleMapsFeatureId("https://www.google.com/maps?ftid=0x8E46:0xB4BB"),
    { kind: "found", featureId: "0x8e46:0xb4bb" },
  );
  assert.deepEqual(
    extractGoogleMapsFeatureId("https://www.google.com/maps/place/Cafe/data=!4m6!1s0x8e46%3A0xb4bb!8m2"),
    { kind: "found", featureId: "0x8e46:0xb4bb" },
  );
  assert.deepEqual(
    extractGoogleMapsFeatureId("https://www.google.com/maps?ftid=0x1:0x2#data=!1s0x1:0x3"),
    { kind: "ambiguous" },
  );
  assert.deepEqual(
    extractGoogleMapsFeatureId("https://www.google.com/maps/place/Cafe"),
    { kind: "missing" },
  );
});

test("builds a direct review URL only from a validated feature id", () => {
  assert.equal(
    buildGoogleReviewUrl("0x8E4683F4AAC3FA5B:0xB4BB717C74160CEA"),
    "https://www.google.com/maps/place//data=!4m3!3m2!1s0x8e4683f4aac3fa5b:0xb4bb717c74160cea!12e1",
  );
  assert.throws(() => buildGoogleReviewUrl("javascript:alert(1)"), /google_review_identifier_invalid/);
});
