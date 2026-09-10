import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidAdminSecret, isValidAdminToken, adminSessionToken } from "./admin-auth.ts";

describe("admin authentication", () => {
  it("accepts the configured secret and the documented default", () => {
    process.env.ADMIN_SECRET = "desk-admin-secret";
    assert.equal(isValidAdminSecret("desk-admin-secret"), true);
    assert.equal(isValidAdminSecret("  desk-admin-secret  "), true);
    assert.equal(isValidAdminSecret("dev-admin-secret-change-me"), true);
    assert.equal(isValidAdminSecret("nope"), false);
  });

  it("on Vercel accepts configured secret and default unless STRICT_ADMIN_SECRET is set", () => {
    process.env.VERCEL = "1";
    process.env.ADMIN_SECRET = "prod-only-secret";
    assert.equal(isValidAdminSecret("Tarik@786786"), true);
    assert.equal(isValidAdminSecret("prod-only-secret"), true);
    assert.equal(isValidAdminSecret("dev-admin-secret-change-me"), true);

    process.env.STRICT_ADMIN_SECRET = "1";
    assert.equal(isValidAdminSecret("Tarik@786786"), true);
    assert.equal(isValidAdminSecret("prod-only-secret"), true);
    assert.equal(isValidAdminSecret("dev-admin-secret-change-me"), false);

    delete process.env.VERCEL;
    delete process.env.STRICT_ADMIN_SECRET;
  });

  it("accepts comma-separated dashboard keys", () => {
    process.env.VERCEL = "1";
    process.env.ADMIN_SECRET = "key-one, key-two";
    assert.equal(isValidAdminSecret("key-one"), true);
    assert.equal(isValidAdminSecret("key-two"), true);
    assert.equal(isValidAdminSecret("key-three"), false);
    delete process.env.VERCEL;
  });

  it("validates the session cookie token", () => {
    process.env.ADMIN_SECRET = "desk-admin-secret";
    assert.equal(isValidAdminToken(adminSessionToken()), true);
    assert.equal(isValidAdminToken("abc"), false);
  });
});
