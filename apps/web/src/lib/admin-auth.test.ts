import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidAdminSecret, isValidAdminToken, adminSessionToken } from "./admin-auth.ts";

describe("admin authentication", () => {
  it("accepts the configured secret", () => {
    process.env.ADMIN_SECRET = "desk-admin-secret";
    assert.equal(isValidAdminSecret("desk-admin-secret"), true);
    assert.equal(isValidAdminSecret("nope"), false);
  });

  it("validates the session cookie token", () => {
    process.env.ADMIN_SECRET = "desk-admin-secret";
    assert.equal(isValidAdminToken(adminSessionToken()), true);
    assert.equal(isValidAdminToken("abc"), false);
  });
});
