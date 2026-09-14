import assert from "node:assert/strict";
import test from "node:test";
import {
  beginGoogleReviewPreparation,
  confirmGoogleReviewPreparation,
  destinationForQuickSetupSave,
  hasPotentialGoogleReviewUrl,
  markGoogleReviewPreviewOpened,
  resolveGoogleReviewPreparation,
} from "../src/features/admin/googleReviewPreparation.ts";

const resolution = {
  sourceKind: "maps_short_link",
  reviewUrl: "https://www.google.com/maps/place//data=!4m3!3m2!1s0x1:0x2!12e1",
  candidateLabel: "Café Central",
  confirmationRequired: true,
};

test("Google destinations require resolved, opened and confirmed preparation before save", () => {
  const input = "https://maps.app.goo.gl/example";
  assert.equal(hasPotentialGoogleReviewUrl(input), true);
  assert.equal(destinationForQuickSetupSave(input, { status: "idle" }), undefined);

  const resolving = beginGoogleReviewPreparation(input);
  assert.equal(destinationForQuickSetupSave(input, resolving), undefined);
  const resolved = resolveGoogleReviewPreparation(resolving, resolution);
  assert.equal(destinationForQuickSetupSave(input, resolved), undefined);
  assert.equal(confirmGoogleReviewPreparation(resolved), resolved);

  const opened = markGoogleReviewPreviewOpened(resolved);
  const confirmed = confirmGoogleReviewPreparation(opened);
  assert.equal(confirmed.status, "confirmed");
  assert.equal(destinationForQuickSetupSave(input, confirmed), resolution.reviewUrl);
});

test("editing the destination invalidates a prior Google confirmation", () => {
  const input = "https://maps.app.goo.gl/example";
  const confirmed = confirmGoogleReviewPreparation(
    markGoogleReviewPreviewOpened(resolveGoogleReviewPreparation(beginGoogleReviewPreparation(input), resolution)),
  );
  assert.equal(destinationForQuickSetupSave(`${input}-changed`, confirmed), undefined);
});

test("non-Google destinations preserve the current direct save path", () => {
  assert.equal(hasPotentialGoogleReviewUrl("https://wa.me/573001234567"), false);
  assert.equal(
    destinationForQuickSetupSave(" https://wa.me/573001234567 ", { status: "idle" }),
    "https://wa.me/573001234567",
  );
});

test("Google-like external hosts never enter the resolver flow", () => {
  assert.equal(hasPotentialGoogleReviewUrl("https://maps.app.goo.gl.evil.example/abc"), false);
});
