import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { acquireWorkerLease, releaseWorkerLease } from "@bot/database";

describe("Worker Session Ownership & Split-Brain Guard", () => {
  const instanceA = "worker-instance-aaa";
  const instanceB = "worker-instance-bbb";

  beforeEach(async () => {
    // Release any lingering lease before each test
    await releaseWorkerLease(instanceA);
    await releaseWorkerLease(instanceB);
  });

  it("permits initial worker to acquire lease", async () => {
    const ok = await acquireWorkerLease(instanceA, 10_000);
    assert.equal(ok, true, "Instance A should acquire free lease");
  });

  it("blocks second worker from acquiring active lease (split-brain defense)", async () => {
    const okA = await acquireWorkerLease(instanceA, 30_000);
    assert.equal(okA, true, "Instance A acquired lease");

    const okB = await acquireWorkerLease(instanceB, 30_000);
    assert.equal(okB, false, "Instance B should be blocked while A holds active lease");
  });

  it("allows same worker to renew its own lease", async () => {
    const ok1 = await acquireWorkerLease(instanceA, 10_000);
    assert.equal(ok1, true);

    const ok2 = await acquireWorkerLease(instanceA, 20_000);
    assert.equal(ok2, true, "Instance A can renew its own lease");
  });

  it("allows another worker to acquire lease after release", async () => {
    await acquireWorkerLease(instanceA, 30_000);
    await releaseWorkerLease(instanceA);

    const okB = await acquireWorkerLease(instanceB, 30_000);
    assert.equal(okB, true, "Instance B should succeed after A cleanly released lease");
  });

  it("allows takeover when lease has expired", async () => {
    // Acquire lease with a negative/zero ttl so it expires immediately
    await acquireWorkerLease(instanceA, -1000);

    const okB = await acquireWorkerLease(instanceB, 30_000);
    assert.equal(okB, true, "Instance B should take over expired lease");
  });
});
