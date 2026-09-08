import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAuthorizedWorkerRequest } from "./auth.ts";

describe("worker API authentication", () => {
  it("rejects missing secrets", () => {
    process.env.WORKER_API_SECRET = "super-secret-value-32chars-min!!";
    assert.equal(isAuthorizedWorkerRequest(undefined, undefined), false);
    assert.equal(isAuthorizedWorkerRequest("Bearer wrong", undefined), false);
  });

  it("accepts bearer or header secret", () => {
    process.env.WORKER_API_SECRET = "super-secret-value-32chars-min!!";
    assert.equal(isAuthorizedWorkerRequest("Bearer super-secret-value-32chars-min!!", undefined), true);
    assert.equal(isAuthorizedWorkerRequest(undefined, "super-secret-value-32chars-min!!"), true);
  });
});
