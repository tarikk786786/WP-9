import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CallRateLimiter } from "../src/safety/rate-limit.js";

describe("Call Rate Limiting & Concurrency Guard", () => {
  test("CallRateLimiter blocks simultaneous concurrent calls when limit is 1", () => {
    const limiter = new CallRateLimiter({
      maxConcurrentCalls: 1,
      cooldownSeconds: 10,
      maxCallsPerHour: 5,
    });

    const jid1 = "user1@s.whatsapp.net";
    const jid2 = "user2@s.whatsapp.net";

    // Call 1 starts
    const check1 = limiter.checkLimit(jid1);
    assert.equal(check1.allowed, true);
    limiter.recordCallStart("call_1", jid1);

    // Call 2 attempted while call 1 is active -> blocked
    const check2 = limiter.checkLimit(jid2);
    assert.equal(check2.allowed, false);
    assert.equal(check2.reason, "MAX_CONCURRENT_REACHED");

    // Call 1 ends
    limiter.recordCallEnd("call_1", jid1);

    // Call 2 now allowed
    const check2After = limiter.checkLimit(jid2);
    assert.equal(check2After.allowed, true);
  });

  test("CallRateLimiter enforces cooldown period for the same caller", () => {
    const limiter = new CallRateLimiter({
      maxConcurrentCalls: 2,
      cooldownSeconds: 30,
      maxCallsPerHour: 10,
    });

    const jid = "caller_cooldown@s.whatsapp.net";
    const now = 1000000;

    limiter.recordCallStart("c1", jid, now);
    limiter.recordCallEnd("c1", jid, now + 10000); // Ended at 1010000

    // Attempt immediately (10s after end, cooldown is 30s)
    const immediateCheck = limiter.checkLimit(jid, now + 20000);
    assert.equal(immediateCheck.allowed, false);
    assert.equal(immediateCheck.reason, "COOLDOWN_ACTIVE");

    // Attempt after 35s has passed
    const afterCooldown = limiter.checkLimit(jid, now + 50000);
    assert.equal(afterCooldown.allowed, true);
  });

  test("CallRateLimiter blocks callers exceeding hourly limit", () => {
    const limiter = new CallRateLimiter({
      maxConcurrentCalls: 5,
      cooldownSeconds: 0,
      maxCallsPerHour: 3,
    });

    const jid = "hourly_caller@s.whatsapp.net";
    const t0 = 2000000;

    // 3 calls within an hour
    limiter.recordCallStart("c1", jid, t0);
    limiter.recordCallEnd("c1", jid, t0 + 1000);

    limiter.recordCallStart("c2", jid, t0 + 2000);
    limiter.recordCallEnd("c2", jid, t0 + 3000);

    limiter.recordCallStart("c3", jid, t0 + 4000);
    limiter.recordCallEnd("c3", jid, t0 + 5000);

    // 4th call within same hour
    const check4 = limiter.checkLimit(jid, t0 + 6000);
    assert.equal(check4.allowed, false);
    assert.equal(check4.reason, "HOURLY_LIMIT_EXCEEDED");
  });
});
