import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { credsAreLinked, phoneFromCreds, shouldWipeAuth } from "./session-policy.ts";

describe("session persistence", () => {
  it("wipes saved login only on loggedOut (401), not timeouts or drops", () => {
    assert.equal(shouldWipeAuth(401), true);
    assert.equal(shouldWipeAuth(408), false);
    assert.equal(shouldWipeAuth(428), false);
    assert.equal(shouldWipeAuth(440), false);
    assert.equal(shouldWipeAuth(500), false);
    assert.equal(shouldWipeAuth(515), false);
    assert.equal(shouldWipeAuth(undefined), false);
  });

  it("treats registered creds as a saved login", () => {
    assert.equal(credsAreLinked(JSON.stringify({ registered: true, me: { id: "919114411026:79@s.whatsapp.net" } })), true);
    assert.equal(phoneFromCreds(JSON.stringify({ me: { id: "919114411026:79@s.whatsapp.net" } })), "919114411026");
    assert.equal(credsAreLinked("{}"), false);
    assert.equal(credsAreLinked("not-json"), false);
  });
});
